/**
 * Model-facing intranet wiki tools over a Confluence-style REST endpoint:
 * `intranet_wiki_read_page` (page or bounded descendant-tree reading),
 * `intranet_wiki_prepare_write` (read-only write plan), and
 * `intranet_wiki_apply_write` (the write itself, routed through the approval
 * seam when `applyWriteApproval` is `ask`). Configuration carries credential
 * reference names, read budgets, and cooperative timeouts; values resolve per
 * call. Named exports preserve loader injection metadata.
 * @module @deepseek-ai/dsh-intranet-tool-wiki
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import { resolveWikiEndpoint } from './credentials.ts'
import { extractWikiPageId, IntranetWikiClient } from './wiki-client.ts'
import { htmlToText } from './html-to-text.ts'
import { escapeHtml, markdownToWikiStorage, summarizeMarkdown } from './wiki-storage-renderer.ts'
import type { WikiPageSummary } from './types.ts'

export type * from './types.ts'

export const name = 'intranet-tool-wiki'
export const inject = ['tools']

/** Read-budget configuration; defaults mirror the hydra-agent production values. */
export interface ReadBudgetConfig {
  /** Current-page text budget applied when the model omits `maxChars`. */
  defaultMaxChars: number
  /** Upper bound the model's `maxChars` is clamped to. */
  maxChars: number
  /** Whole-call text budget across every page in `descendants` scope. */
  totalMaxChars: number
  /** Deepest descendant level readable; also the default when omitted. */
  maxDepth: number
  /** Descendant page count applied when the model omits `maxPages`. */
  defaultMaxPages: number
  /** Upper bound the model's `maxPages` is clamped to. */
  maxPages: number
  /** Per-page text budget applied when the model omits `maxCharsPerPage`. */
  defaultMaxCharsPerPage: number
  /** Upper bound the model's `maxCharsPerPage` is clamped to. */
  maxCharsPerPage: number
}

/** Intranet wiki tool configuration. */
export interface Config {
  /** Credential reference naming the wiki API base URL. */
  baseUrlEnv: string
  /** Credential reference naming the wiki bearer token. */
  tokenEnv: string
  /**
   * Required deployment policy for `intranet_wiki_apply_write`: `ask` routes
   * every call through the approval seam (and fails closed without one),
   * `allow` executes without asking.
   */
  applyWriteApproval: 'ask' | 'allow'
  /** Cooperative deadline for read-side calls, enforced by the timeout policy. */
  readTimeoutMs: number
  /** Cooperative deadline for prepare/apply calls, enforced by the timeout policy. */
  writeTimeoutMs: number
  /** Read budgets for page bodies and descendant walks. */
  read: ReadBudgetConfig
}

/** Schemastery configuration for the intranet wiki tool consumer. */
export const Config: z<Config> = z.object({
  baseUrlEnv: z.string().role('credential-ref').default('INTRANET_WIKI_BASE_URL'),
  tokenEnv: z.string().role('credential-ref').default('INTRANET_WIKI_TOKEN'),
  applyWriteApproval: z.union(['ask', 'allow'] as const).required(),
  readTimeoutMs: z.number().step(1).min(1).default(60000),
  writeTimeoutMs: z.number().step(1).min(1).default(30000),
  read: z.object({
    defaultMaxChars: z.number().step(1).min(1).default(60000),
    maxChars: z.number().step(1).min(1).default(100000),
    totalMaxChars: z.number().step(1).min(1).default(150000),
    maxDepth: z.number().step(1).min(1).default(10),
    defaultMaxPages: z.number().step(1).min(1).default(30),
    maxPages: z.number().step(1).min(1).default(100),
    defaultMaxCharsPerPage: z.number().step(1).min(1).default(20000),
    maxCharsPerPage: z.number().step(1).min(1).default(60000),
  }),
})

/** Registered name of the write tool, shared with the approval gate. */
const APPLY_WRITE_NAME = 'intranet_wiki_apply_write'

/** Floor for the per-page budget so one page cannot be starved to nothing. */
const MIN_CHARS_PER_PAGE = 1000

/** The two supported write-back actions. */
const WRITE_ACTIONS = ['create_child', 'append_page'] as const

/** Fallback heading label for `append_page` when the model supplies no title. */
const DEFAULT_APPEND_TITLE = 'AI 补充内容'

/**
 * Clamp a model-supplied integer into a budget window.
 * @param value - schema-validated candidate, absent when omitted.
 * @param fallback - value applied when omitted or non-finite.
 * @param min - inclusive lower bound.
 * @param max - inclusive upper bound.
 * @returns the clamped integer.
 */
function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value), min), max)
}

/** Trim a schema-validated optional string to a non-empty value or `undefined`. */
function trimmedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined
}

/** One page entry of the read tool's canonical output. */
interface ReadPageEntry {
  pageId: string
  parentPageId?: string
  depth: number
  title?: string
  url?: string
  version?: number
  text?: string
  truncated?: boolean
  error?: string
}

/** Write-target parameters shared by the prepare and apply tools. */
interface WriteTargetArgs {
  action: 'create_child' | 'append_page'
  parentPageId?: string
  pageId?: string
  targetWikiUrl?: string
  title?: string
  contentMarkdown: string
}

/** Cross-field-validated create-child request. */
interface CreateChildRequest {
  action: 'create_child'
  /** Parent page id the child is created under. */
  parentPageId: string
  /** Trimmed non-empty child page title. */
  title: string
  /** Trimmed non-empty Markdown body. */
  contentMarkdown: string
}

/** Cross-field-validated append request. */
interface AppendPageRequest {
  action: 'append_page'
  /** Target page id the content is appended to. */
  pageId: string
  /** Trimmed heading label; the default label applies when absent. */
  title?: string | undefined
  /** Trimmed non-empty Markdown body. */
  contentMarkdown: string
}

/** Cross-field-validated write request the schema alone cannot express. */
type ResolvedWriteRequest = CreateChildRequest | AppendPageRequest

/**
 * Validate the write-target rules shared by prepare and apply: a non-empty
 * body, a parent page and title for `create_child`, and a page id or URL
 * carrying one for `append_page`.
 * @param args - schema-validated tool arguments.
 * @returns the resolved request.
 */
function resolveWriteRequest(args: WriteTargetArgs): ResolvedWriteRequest {
  const contentMarkdown = args.contentMarkdown.trim()
  if (contentMarkdown.length === 0) {
    throw new Error("'contentMarkdown' is required and must be a non-empty string")
  }
  const title = trimmedOrUndefined(args.title)
  if (args.action === 'create_child') {
    const parentPageId = trimmedOrUndefined(args.parentPageId)
    if (parentPageId === undefined) throw new Error("'parentPageId' is required for create_child")
    if (title === undefined) throw new Error("'title' is required for create_child")
    return { action: args.action, parentPageId, title, contentMarkdown }
  }
  const pageId = trimmedOrUndefined(args.pageId) ?? extractWikiPageId(args.targetWikiUrl)
  if (pageId === undefined) {
    throw new Error("Either 'pageId' or 'targetWikiUrl' is required for append_page")
  }
  return { action: args.action, pageId, ...title === undefined ? {} : { title }, contentMarkdown }
}

/** Render one canonical value as the pretty-JSON Native content hydra shipped. */
function renderJson(value: unknown): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

/** Shared write-target parameter schema of the prepare and apply tools. */
const WRITE_PARAMETERS = {
  action: {
    type: 'string',
    required: true,
    enum: WRITE_ACTIONS,
    description: 'create_child creates a child page; append_page appends to an existing page',
  },
  parentPageId: {
    type: 'string',
    description: 'Parent wiki page id for create_child',
  },
  pageId: {
    type: 'string',
    description: 'Target wiki page id for append_page',
  },
  targetWikiUrl: {
    type: 'string',
    description: 'Target wiki URL containing pageId, alternative to pageId',
  },
  title: {
    type: 'string',
    description: 'Child page title for create_child; optional heading label for append_page',
  },
} as const

/**
 * Register the three intranet wiki tools and, under the `ask` policy, the
 * `tools/pre-execute` gate that routes every apply-write call through the
 * approval seam.
 * @param ctx - registrant context carrying the tool registry.
 * @param config - deployment's explicit wiki policy and budgets.
 */
export function apply(ctx: Context, config: Config): void {
  const budgets = config.read

  if (config.applyWriteApproval === 'ask') {
    ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
      if (exec.name !== APPLY_WRITE_NAME) return next()
      return { kind: 'ask', reason: 'This call writes to the intranet wiki.' }
    })
  }

  ctx.tools.register(defineTool({
    name: 'intranet_wiki_read_page',
    description:
      'Read an intranet company wiki page by URL or pageId. By default reads only the current '
      + 'page; use scope=descendants only when the user explicitly requests child pages.',
    parameters: {
      url: {
        type: 'string',
        description: 'Intranet wiki page URL, usually containing pageId',
      },
      pageId: {
        type: 'string',
        description: 'Wiki page id when URL is not provided',
      },
      maxChars: {
        type: 'integer',
        description: `Maximum text characters for the current scope, default ${budgets.defaultMaxChars}`,
      },
      scope: {
        type: 'string',
        enum: ['current', 'descendants'],
        description: 'Read only the current page (default) or the root page and its descendants',
      },
      maxDepth: {
        type: 'integer',
        description: `Maximum descendant depth, default and maximum ${budgets.maxDepth}`,
      },
      maxPages: {
        type: 'integer',
        description: `Maximum descendant pages, default ${budgets.defaultMaxPages} and maximum ${budgets.maxPages}`,
      },
      maxCharsPerPage: {
        type: 'integer',
        description: `Maximum text characters per page in descendants scope, default ${budgets.defaultMaxCharsPerPage}`,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          scope: { type: 'string', required: true, enum: ['current', 'descendants'] },
          rootPageId: { type: 'string', required: true },
          discoveredCount: { type: 'integer', required: true },
          fetchedCount: { type: 'integer', required: true },
          failedCount: { type: 'integer', required: true },
          treeTruncated: { type: 'boolean', required: true },
          contentTruncated: { type: 'boolean', required: true },
          completeness: {
            type: 'string',
            required: true,
            enum: ['complete', 'partial_tree', 'partial_access', 'partial_content'],
          },
          pages: {
            type: 'array',
            required: true,
            description: 'The root page first, then descendants in discovery order.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                pageId: { type: 'string', required: true },
                parentPageId: { type: 'string' },
                depth: { type: 'integer', required: true },
                title: { type: 'string' },
                url: { type: 'string' },
                version: { type: 'integer' },
                text: { type: 'string' },
                truncated: { type: 'boolean' },
                error: { type: 'string', description: 'Set when this page failed to load; body fields are then absent.' },
              },
            },
          },
          warnings: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => renderJson(value),
    },
    timeoutMs: config.readTimeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const url = trimmedOrUndefined(args.url)
      const pageId = trimmedOrUndefined(args.pageId) ?? extractWikiPageId(url)
      const scope = args.scope === 'descendants' ? 'descendants' : 'current'
      if (url === undefined && pageId === undefined) {
        throw new Error("Either 'url' or 'pageId' is required")
      }
      const maxChars = clampInteger(args.maxChars, budgets.defaultMaxChars, 1, budgets.maxChars)
      const endpoint = await resolveWikiEndpoint(ctx, config)
      const client = new IntranetWikiClient(endpoint)

      if (scope === 'current') {
        const page = await client.readPage({ url, pageId, signal: exec.signal })
        const converted = htmlToText(page.html, { maxChars })
        const pageUrl = page.url.length > 0 ? page.url : url
        return {
          scope: 'current' as const,
          rootPageId: page.pageId,
          discoveredCount: 1,
          fetchedCount: 1,
          failedCount: 0,
          treeTruncated: false,
          contentTruncated: converted.truncated,
          completeness: converted.truncated ? 'partial_content' as const : 'complete' as const,
          pages: [{
            pageId: page.pageId,
            depth: 0,
            title: page.title,
            ...pageUrl === undefined ? {} : { url: pageUrl },
            ...page.version === undefined ? {} : { version: page.version },
            text: converted.text,
            truncated: converted.truncated,
          }],
          warnings: converted.truncated
            ? [`The page body exceeds ${maxChars} characters and was truncated`]
            : [],
        }
      }

      if (pageId === undefined) {
        throw new Error('descendants scope requires a wiki pageId or URL containing pageId')
      }
      const maxDepth = clampInteger(args.maxDepth, budgets.maxDepth, 1, budgets.maxDepth)
      const maxPages = clampInteger(args.maxPages, budgets.defaultMaxPages, 1, budgets.maxPages)
      const maxCharsPerPage = clampInteger(
        args.maxCharsPerPage,
        budgets.defaultMaxCharsPerPage,
        MIN_CHARS_PER_PAGE,
        budgets.maxCharsPerPage,
      )
      const tree = await client.listDescendantPages({
        rootPageId: pageId,
        maxDepth,
        maxPages,
        signal: exec.signal,
      })
      const targets: { pageId: string; depth: number; parentPageId?: string }[] = [
        { pageId, depth: 0 },
        ...tree.pages.map((page: WikiPageSummary) => ({
          pageId: page.pageId,
          depth: page.depth,
          parentPageId: page.parentPageId,
        })),
      ]
      const pages: ReadPageEntry[] = []
      const warnings = [...tree.warnings]
      let remainingChars = Math.min(maxChars, budgets.totalMaxChars)
      let failedCount = 0
      let contentTruncated = false

      for (const target of targets) {
        try {
          const item = await client.readPage({
            pageId: target.pageId,
            url: target.depth === 0 ? url : undefined,
            signal: exec.signal,
          })
          const pageBudget = Math.min(maxCharsPerPage, Math.max(remainingChars, 0))
          const itemUrl = item.url.length > 0 ? item.url : undefined
          if (pageBudget === 0) {
            contentTruncated = true
            pages.push({
              pageId: item.pageId,
              ...target.parentPageId === undefined ? {} : { parentPageId: target.parentPageId },
              depth: target.depth,
              title: item.title,
              ...itemUrl === undefined ? {} : { url: itemUrl },
              ...item.version === undefined ? {} : { version: item.version },
              text: '',
              truncated: true,
            })
            continue
          }
          const converted = htmlToText(item.html, { maxChars: pageBudget })
          remainingChars -= converted.text.length
          contentTruncated ||= converted.truncated
          pages.push({
            pageId: item.pageId,
            ...target.parentPageId === undefined ? {} : { parentPageId: target.parentPageId },
            depth: target.depth,
            title: item.title,
            ...itemUrl === undefined ? {} : { url: itemUrl },
            ...item.version === undefined ? {} : { version: item.version },
            text: converted.text,
            truncated: converted.truncated,
          })
        } catch (err) {
          // Cancellation must stop the walk; only per-page read failures are
          // recorded and skipped.
          if (exec.signal.aborted) throw err
          failedCount++
          pages.push({
            pageId: target.pageId,
            ...target.parentPageId === undefined ? {} : { parentPageId: target.parentPageId },
            depth: target.depth,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      if (failedCount > 0) warnings.push(`${failedCount} page(s) failed to load`)
      if (contentTruncated) warnings.push('Page bodies exceed the character budget; some content was truncated')
      const completeness = tree.truncated
        ? 'partial_tree' as const
        : failedCount > 0
          ? 'partial_access' as const
          : contentTruncated
            ? 'partial_content' as const
            : 'complete' as const

      return {
        scope: 'descendants' as const,
        rootPageId: pageId,
        discoveredCount: targets.length,
        fetchedCount: targets.length - failedCount,
        failedCount,
        treeTruncated: tree.truncated,
        contentTruncated,
        completeness,
        pages,
        warnings,
      }
    },
    presentCall: (args) => {
      const target = trimmedOrUndefined(args.pageId) ?? extractWikiPageId(args.url) ?? trimmedOrUndefined(args.url)
      return {
        card: 'generic',
        kind: 'read',
        title: args.scope === 'descendants'
          ? `Read intranet wiki page tree ${target ?? ''}`.trimEnd()
          : `Read intranet wiki page ${target ?? ''}`.trimEnd(),
        rawInput: args,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'intranet_wiki_prepare_write',
    description:
      'Prepare an intranet wiki write-back plan without changing the wiki. Use before writing '
      + 'requirement review or generated technical documents to the wiki.',
    parameters: {
      ...WRITE_PARAMETERS,
      contentMarkdown: {
        type: 'string',
        required: true,
        description: 'Full Markdown content that would be written',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true, enum: WRITE_ACTIONS },
          target: {
            type: 'object',
            required: true,
            additionalProperties: false,
            description: 'The page the write would touch: the parent for create_child, the page itself for append_page.',
            properties: {
              type: { type: 'string', required: true, enum: ['child', 'page'] },
              pageId: { type: 'string', required: true },
              title: { type: 'string', required: true },
              url: { type: 'string', required: true },
            },
          },
          title: { type: 'string', required: true },
          writeMode: { type: 'string', required: true },
          baseVersion: {
            type: 'integer',
            description: 'Pass to intranet_wiki_apply_write for append_page; the write fails on a version change.',
          },
          contentMarkdown: { type: 'string', required: true },
          contentSummary: { type: 'array', required: true, items: { type: 'string' } },
          contentChars: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => renderJson(value),
    },
    timeoutMs: config.writeTimeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const request = resolveWriteRequest(args)
      const endpoint = await resolveWikiEndpoint(ctx, config)
      const client = new IntranetWikiClient(endpoint)
      // The prepare step proves the content renders to storage format so the
      // apply step cannot fail on conversion after the user confirmed.
      markdownToWikiStorage(request.contentMarkdown)

      if (request.action === 'create_child') {
        const parent = await client.readPage({ pageId: request.parentPageId, signal: exec.signal })
        return {
          action: request.action,
          target: { type: 'child' as const, pageId: parent.pageId, title: parent.title, url: parent.url },
          title: request.title,
          writeMode: 'create child page; original page will not be modified',
          contentMarkdown: request.contentMarkdown,
          contentSummary: summarizeMarkdown(request.contentMarkdown),
          contentChars: request.contentMarkdown.length,
        }
      }

      const page = await client.readPage({ pageId: request.pageId, signal: exec.signal })
      return {
        action: request.action,
        target: { type: 'page' as const, pageId: page.pageId, title: page.title, url: page.url },
        title: request.title ?? DEFAULT_APPEND_TITLE,
        writeMode: 'append to page end',
        ...page.version === undefined ? {} : { baseVersion: page.version },
        contentMarkdown: request.contentMarkdown,
        contentSummary: summarizeMarkdown(request.contentMarkdown),
        contentChars: request.contentMarkdown.length,
      }
    },
    presentCall: args => ({
      card: 'generic',
      kind: 'read',
      title: `Prepare intranet wiki write (${args.action})`,
      rawInput: args,
    }),
  }))

  ctx.tools.register(defineTool({
    name: APPLY_WRITE_NAME,
    description:
      'Write generated content to an intranet company wiki page. This is a high-risk write tool '
      + 'and must only be used after the user explicitly asks to write back.',
    parameters: {
      ...WRITE_PARAMETERS,
      contentMarkdown: {
        type: 'string',
        required: true,
        description: 'Full Markdown content to write. Must be the complete user-confirmed content, never a summary.',
      },
      baseVersion: {
        type: 'integer',
        description: 'Version number returned by the prepare step for append_page; the write fails if the current page version differs',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: {
            type: 'string',
            required: true,
            enum: ['written', 'version_conflict'],
            description: 'version_conflict means the page moved past baseVersion; prepare again before retrying.',
          },
          action: { type: 'string', required: true, enum: WRITE_ACTIONS },
          pageId: { type: 'string', required: true },
          title: { type: 'string' },
          url: { type: 'string' },
          version: { type: 'integer' },
          message: { type: 'string' },
          baseVersion: { type: 'integer' },
          currentVersion: { type: 'integer' },
        },
      },
      render: (_args, value) => renderJson(value),
    },
    timeoutMs: config.writeTimeoutMs,
    async execute(args, exec) {
      const request = resolveWriteRequest(args)
      const endpoint = await resolveWikiEndpoint(ctx, config)
      const client = new IntranetWikiClient(endpoint)
      const contentStorage = markdownToWikiStorage(request.contentMarkdown)

      if (request.action === 'create_child') {
        const created = await client.createChildPage({
          parentPageId: request.parentPageId,
          title: request.title,
          storage: contentStorage,
          signal: exec.signal,
        })
        return {
          status: 'written' as const,
          action: request.action,
          pageId: created.pageId,
          title: created.title,
          url: created.url,
          ...created.version === undefined ? {} : { version: created.version },
        }
      }

      const page = await client.readPage({ pageId: request.pageId, signal: exec.signal })
      const baseVersion = args.baseVersion
      if (baseVersion !== undefined && page.version !== undefined && baseVersion !== page.version) {
        return {
          status: 'version_conflict' as const,
          action: request.action,
          pageId: page.pageId,
          message: 'The wiki page has been updated by someone else; run intranet_wiki_prepare_write again before writing back.',
          baseVersion,
          currentVersion: page.version,
        }
      }

      const appendTitle = request.title ?? DEFAULT_APPEND_TITLE
      const nextStorage = `${page.html}<h2>${escapeHtml(appendTitle)}</h2>${contentStorage}`
      const updated = await client.updatePage({
        pageId: page.pageId,
        title: page.title,
        version: (page.version ?? 0) + 1,
        storage: nextStorage,
        signal: exec.signal,
      })

      return {
        status: 'written' as const,
        action: request.action,
        pageId: updated.pageId.length > 0 ? updated.pageId : page.pageId,
        title: updated.title.length > 0 ? updated.title : page.title,
        url: updated.url.length > 0 ? updated.url : page.url,
        ...updated.version === undefined ? {} : { version: updated.version },
      }
    },
    presentCall: (args) => {
      const target = trimmedOrUndefined(args.pageId)
        ?? extractWikiPageId(args.targetWikiUrl)
        ?? trimmedOrUndefined(args.parentPageId)
      return {
        card: 'generic',
        kind: 'edit',
        title: args.action === 'create_child'
          ? `Write intranet wiki: create child page under ${target ?? '?'}`
          : `Write intranet wiki: append to page ${target ?? '?'}`,
        rawInput: args,
      }
    },
  }))
}
