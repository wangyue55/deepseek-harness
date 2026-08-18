/**
 * Deterministic loopback Confluence-style fixture for the intranet-wiki
 * snapshot scenario: one parent page and a stateless create-child endpoint on
 * a fixed port, so recording and keyless replay drive the REAL
 * `dsh-intranet-tool-wiki` client, HTML-to-text pass, and storage rendering
 * without a company network. The port is fixed because the page URL and the
 * created-page echo are part of the recorded model transcript; responses are
 * pure functions of the request, so replay's re-executed fetches see the
 * exact recorded world.
 */
import { createServer } from 'node:http'

/** Fixed loopback port the scenario prompt and credentials point at. */
const PORT = 43121

/** The parent page the scenario reads and writes under. */
const PARENT = {
  id: '9001',
  title: 'Requirement Review Hub',
  version: { number: 4 },
  space: { key: 'RVW' },
  body: {
    storage: {
      value: '<h1>Requirement Review Hub</h1><p>Collected review notes &amp; decisions.</p>'
        + '<ul><li>Scope</li><li>Risks</li></ul>',
    },
  },
  _links: { webui: '/pages/viewpage.action?pageId=9001' },
}

/** The deterministic create-child echo. */
const CREATED = {
  id: '9100',
  title: 'Review Notes',
  version: { number: 1 },
  space: { key: 'RVW' },
  body: { storage: { value: '' } },
  _links: { webui: '/pages/viewpage.action?pageId=9100' },
}

/** Cordis plugin name. */
export const name = 'intranet-wiki-fixture-server'

/**
 * Start the fixture server on 127.0.0.1 and register its shutdown.
 * @param ctx - Cordis context; the effect disposes the server with the fiber.
 */
export async function apply(ctx) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
    if (req.method === 'GET' && url.pathname === '/rest/api/content/9001') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(PARENT))
      return
    }
    if (req.method === 'POST' && url.pathname === '/rest/api/content') {
      // Drain the body so keep-alive stays healthy; the echo is fixed either way.
      req.resume()
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(CREATED))
      })
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(PORT, '127.0.0.1', () => resolve(undefined))
  })
  // The fixture must never hold the process open past protocol shutdown.
  server.unref()
  ctx.effect(() => async () => {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve(undefined))
    })
  })
}
