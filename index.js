/**
 * dsh-session-stars — Host half.
 *
 * Owns the star list (one JSON file under $DSH_HOME/session-stars), enriches it
 * with live session data (fresh title, existence, workspace name) and serves
 * the loopback HTTP API the Client half reads.
 *
 * Design notes
 * - The Host is the single source of truth: the Client never writes its own
 *   copy, so a refresh in another tab cannot diverge.
 * - Reads are best-effort: a missing `sessionQuery` or `workspaceRegistry`
 *   degrades the enrichment, it never fails the request.
 * - Every mutating call runs through one promise chain so two tabs cannot
 *   interleave a read-modify-write of the store file.
 * - The route is a `handler` route, not a `resource` route: `resource` answers
 *   GET/HEAD only (everything else is 405 before the handler is reached) and
 *   this plugin needs POST for writes.
 */
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import {
  MAX_ITEMS,
  emptyStore,
  normalizeStore,
  sortStars,
  starSession,
  toggleSession,
  unstarSession,
} from './lib/store.js'

const API_PREFIX = '/api/session-stars'
const WRITE_HEADER = 'x-dsh-session-stars'
const MAX_BODY_BYTES = 64 * 1024

/** Directory the store lives in; `DSH_HOME` is what the Host itself uses. */
function storeDir() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'session-stars')
}

function storeFile() {
  return join(storeDir(), 'stars.json')
}

// --------------------------------------------------------------------- store

let chain = Promise.resolve()

/** One read-modify-write at a time; the chain survives a rejected task. */
function serialize(task) {
  const run = chain.then(task, task)
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function readStore() {
  const file = storeFile()
  try {
    const raw = await readFile(file, 'utf8')
    return normalizeStore(JSON.parse(raw))
  } catch (error) {
    if (error && error.code === 'ENOENT') return emptyStore()
    // A corrupt file must not take the panel down: keep the bytes aside.
    try {
      await copyFile(file, `${file}.corrupt-${Date.now()}`)
    } catch {
      /* ignore: a read-only profile only costs the backup */
    }
    return emptyStore()
  }
}

async function writeStore(state) {
  const dir = storeDir()
  await mkdir(dir, { recursive: true })
  const file = storeFile()
  const next = { ...state, version: 1, updated: new Date().toISOString() }
  const body = `${JSON.stringify(next, null, 2)}\n`
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, body, 'utf8')
  await rename(tmp, file)
  return next
}

// ---------------------------------------------------------------- enrichment

function optionalService(ctx, name) {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}

function pathKey(value) {
  if (typeof value !== 'string' || !value) return ''
  return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function baseName(value) {
  const text = String(value || '').replace(/[\\/]+$/, '')
  if (!text) return ''
  const parts = text.split(/[\\/]/)
  return parts[parts.length - 1] || text
}

/** cwd → workspace display name, from the durable workspace registry. */
function workspaceNames(ctx) {
  const names = new Map()
  const registry = optionalService(ctx, 'workspaceRegistry')
  if (!registry || typeof registry.list !== 'function') return names
  let list = []
  try {
    list = registry.list() || []
  } catch {
    return names
  }
  for (const workspace of list) {
    if (!workspace) continue
    const key = pathKey(workspace.path)
    if (!key) continue
    const title = typeof workspace.title === 'string' ? workspace.title.trim() : ''
    names.set(key, title || baseName(workspace.path))
  }
  return names
}

/**
 * Attach fresh titles, existence and workspace names.
 * Any failure keeps the stored snapshot: a stale title beats an empty panel.
 */
async function enrich(ctx, items) {
  const ids = items.map((item) => item.sessionId)
  const alive = new Set()
  const titles = new Map()
  const cwds = new Map()

  const query = optionalService(ctx, 'sessionQuery')
  if (query && ids.length > 0) {
    try {
      const records = (await query.filterSessions([{ kind: 'id', values: ids }])) || []
      for (const record of records) {
        const id = record && record.header && record.header.id
        if (!id) continue
        alive.add(id)
        if (typeof record.header.cwd === 'string' && record.header.cwd) cwds.set(id, record.header.cwd)
      }
    } catch {
      /* fall through: unknown existence is reported as not alive */
    }
    try {
      const results = (await query.readTitleSnapshots(ids)) || []
      for (const result of results) {
        if (!result || result.status !== 'fulfilled') continue
        const snapshot = result.value && result.value.title
        if (snapshot && typeof snapshot.title === 'string' && snapshot.title.trim()) {
          titles.set(result.sessionId, snapshot.title.trim())
        }
      }
    } catch {
      /* keep stored titles */
    }
  }

  const names = workspaceNames(ctx)
  return items.map((item) => {
    const cwd = cwds.get(item.sessionId) || item.cwd || null
    const workspaceTitle = cwd ? names.get(pathKey(cwd)) || baseName(cwd) || null : null
    return {
      sessionId: item.sessionId,
      title: titles.get(item.sessionId) || item.title || '',
      cwd,
      workspaceTitle,
      starredAt: item.starredAt,
      alive: alive.has(item.sessionId),
    }
  })
}

async function buildState(ctx) {
  const store = await readStore()
  return {
    version: store.version,
    updated: store.updated,
    items: await enrich(ctx, sortStars(store.items)),
  }
}

async function applyOp(ctx, payload) {
  const op = String((payload && payload.op) || '')
  const request = { sessionId: payload && payload.sessionId, title: payload && payload.title, cwd: payload && payload.cwd }

  const result = await serialize(async () => {
    const store = await readStore()
    let next
    if (op === 'star') next = starSession(store.items, request)
    else if (op === 'unstar') next = unstarSession(store.items, request.sessionId)
    else if (op === 'toggle') next = toggleSession(store.items, request)
    else throw new Error(`unknown op: ${op || '(empty)'}`)
    if (!next.changed) return { store, starred: Boolean(next.starred) }
    const saved = await writeStore({ ...store, items: next.items.slice(0, MAX_ITEMS) })
    return { store: saved, starred: Boolean(next.starred) }
  })

  return {
    starred: result.starred,
    version: result.store.version,
    updated: result.store.updated,
    items: await enrich(ctx, sortStars(result.store.items)),
  }
}

// ------------------------------------------------------------------ security

function headerOf(req, name) {
  const value = req.headers ? req.headers[name] : undefined
  return Array.isArray(value) ? value[0] : value
}

/**
 * No-CORS JSON API.
 *
 * - A present `Origin` must match the request `Host`, so a foreign page cannot
 *   drive the API even where CORS would already block reading the reply.
 * - Writes additionally require `x-dsh-session-stars: 1` plus a JSON content
 *   type: a cross-site form cannot set that header, and a cross-site `fetch`
 *   would need a preflight this route never grants.
 *
 * Host is deliberately not pinned to loopback: the GUI may be reached through
 * remote access on some other authority, and same-origin is what matters here.
 */
function requestAllowed(req, write) {
  const origin = headerOf(req, 'origin')
  if (origin) {
    let parsed
    try {
      parsed = new URL(origin)
    } catch {
      return false
    }
    if (parsed.host !== headerOf(req, 'host')) return false
  }
  if (write) {
    if (headerOf(req, WRITE_HEADER) !== '1') return false
    const contentType = String(headerOf(req, 'content-type') || '')
    if (!contentType.toLowerCase().includes('application/json')) return false
  }
  return true
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  const parsed = JSON.parse(text)
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

// ------------------------------------------------------------------- routing

async function handleRequest(ctx, req, res) {
  const method = (req.method || 'GET').toUpperCase()
  const path = new URL(req.url || '/', 'http://127.0.0.1').pathname
  const isState = path === `${API_PREFIX}/state` || path === `${API_PREFIX}/state/`
  const isOp = path === `${API_PREFIX}/op` || path === `${API_PREFIX}/op/`

  if (!isState && !isOp) return sendJson(res, 404, { ok: false, error: 'not found' })

  const write = isOp && method === 'POST'
  if (!requestAllowed(req, write)) return sendJson(res, 403, { ok: false, error: 'forbidden' })

  if (isState) {
    if (method !== 'GET' && method !== 'HEAD') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return sendJson(res, 200, await buildState(ctx))
  }

  if (method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
  let payload
  try {
    payload = await readJsonBody(req)
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: String((error && error.message) || 'invalid json') })
  }
  try {
    return sendJson(res, 200, { ok: true, value: await applyOp(ctx, payload) })
  } catch (error) {
    return sendJson(res, 200, { ok: false, error: String((error && error.message) || error) })
  }
}

// --------------------------------------------------------------------- apply

export function apply(ctx) {
  ctx.inject(['webServer'], (inner) => {
    inner.effect(() =>
      inner.webServer.register({
        kind: 'prefix',
        path: API_PREFIX,
        handler: (req, res) => handleRequest(inner, req, res).catch((error) => {
          try {
            sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
          } catch {
            /* the socket is already gone */
          }
        }),
      }),
    )
  })
}
