/**
 * Deterministic loopback GitLab v4 fixture for the intranet-gitlab snapshot
 * scenario: one project with one analyzable source file on a fixed port, so
 * recording and keyless replay drive the REAL `dsh-intranet-tool-gitlab`
 * resolution, discovery probes, and bounded reading without a company
 * network. Responses are pure functions of the request, so replay's
 * re-executed fetches see the exact recorded world.
 */
import { createServer } from 'node:http'

/** Fixed loopback port the scenario credentials point at. */
const PORT = 43122

/** The project the scenario analyzes. */
const PROJECT = {
  id: 4200,
  name: 'Heads H5',
  path: 'heads-h5',
  path_with_namespace: 'ficc/heads-h5',
  default_branch: 'main',
}

/** The one analyzable source file. */
const MAIN_TS = [
  "import { render } from './render'",
  'export class HeadsPage {}',
  "export const loadHeads = () => fetch('/api/heads/list')",
  "const routes = [{ path: '/heads', component: 'HeadsPage' }]",
  'export default routes',
].join('\n')

/** Cordis plugin name. */
export const name = 'intranet-gitlab-fixture-server'

/**
 * Start the fixture server on 127.0.0.1 and register its shutdown.
 * @param ctx - Cordis context; the effect disposes the server with the fiber.
 */
export async function apply(ctx) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
    const json = (value) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(value))
    }
    if (url.pathname === '/api/v4/projects/4200') {
      json(PROJECT)
      return
    }
    if (url.pathname === '/api/v4/projects/4200/repository/files/src%2Fmain.ts/raw') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(MAIN_TS)
      return
    }
    // Guidance probes (CLAUDE.md, the module guide) and everything else miss.
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end('{"message":"404 Not Found"}')
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
