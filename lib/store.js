/**
 * dsh-session-stars — pure store helpers.
 *
 * Everything here is a value transform: no filesystem, no Cordis, no clock of
 * its own (callers pass `now`). That keeps the rules testable and lets the Host
 * half own all I/O.
 */

export const STORE_VERSION = 1
export const MAX_TITLE = 300
export const MAX_SESSION_ID = 200
export const MAX_ITEMS = 2000

/** @typedef {{ sessionId: string, title: string, cwd: string | null, starredAt: string }} StarItem */
/** @typedef {{ version: number, updated: string, items: StarItem[] }} StarStore */

export function emptyStore(now = new Date().toISOString()) {
  return { version: STORE_VERSION, updated: now, items: [] }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asIsoString(value, fallback) {
  if (typeof value === 'string' && value.length > 0) {
    const time = Date.parse(value)
    if (Number.isFinite(time)) return new Date(time).toISOString()
  }
  return fallback
}

export function sanitizeSessionId(value) {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  if (!text || text.length > MAX_SESSION_ID) return ''
  return text
}

export function sanitizeTitle(value) {
  if (typeof value !== 'string') return ''
  const text = value.replace(/[\r\n\t]+/g, ' ').trim()
  if (!text) return ''
  return text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE - 1)}…` : text
}

function sanitizeCwd(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > 1024) return null
  return text
}

/** Oldest first, so trimming the overflow drops the least recent stars. */
export function compareOldestFirst(a, b) {
  const left = Date.parse(a.starredAt)
  const right = Date.parse(b.starredAt)
  if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right
  return a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0
}

/** Newest first: the order both the store file and the panel use. */
export function sortStars(items) {
  return Array.from(items).sort((a, b) => -compareOldestFirst(a, b))
}

/**
 * Accept only well-formed entries and drop duplicates (last one wins), so a
 * hand-edited or partially written file can never poison the store.
 */
export function normalizeStore(raw, now = new Date().toISOString()) {
  if (!isPlainObject(raw) || !Array.isArray(raw.items)) return emptyStore(now)
  const byId = new Map()
  for (const entry of raw.items) {
    if (!isPlainObject(entry)) continue
    const sessionId = sanitizeSessionId(entry.sessionId)
    if (!sessionId) continue
    const title = sanitizeTitle(entry.title)
    const cwd = sanitizeCwd(entry.cwd)
    const starredAt = asIsoString(entry.starredAt, now)
    byId.set(sessionId, { sessionId, title, cwd, starredAt })
  }
  const items = sortStars(Array.from(byId.values())).slice(0, MAX_ITEMS)
  return {
    version: STORE_VERSION,
    updated: asIsoString(raw.updated, now),
    items,
  }
}

export function findStar(items, sessionId) {
  const id = sanitizeSessionId(sessionId)
  if (!id) return undefined
  return items.find((item) => item.sessionId === id)
}

/**
 * Add a star. Starring twice keeps the original `starredAt` (the star is when
 * the user first marked the session) and only refreshes a better title, which
 * is what happens when a session is renamed after it was starred.
 */
export function starSession(items, input, now = new Date().toISOString()) {
  const sessionId = sanitizeSessionId(input && input.sessionId)
  if (!sessionId) throw new Error('sessionId is required')
  const title = sanitizeTitle(input && input.title)
  const cwd = sanitizeCwd(input && input.cwd)
  const existing = findStar(items, sessionId)
  if (existing) {
    const next = {
      ...existing,
      title: title || existing.title,
      cwd: cwd || existing.cwd,
    }
    return {
      items: sortStars(items.map((item) => (item.sessionId === sessionId ? next : item))),
      item: next,
      starred: true,
      changed: next.title !== existing.title || next.cwd !== existing.cwd,
    }
  }
  const item = { sessionId, title, cwd, starredAt: asIsoString(now, new Date().toISOString()) }
  const next = sortStars([...items, item])
  return {
    items: next.length > MAX_ITEMS ? sortStars(next.slice(0, MAX_ITEMS)) : next,
    item,
    starred: true,
    changed: true,
  }
}

export function unstarSession(items, sessionId) {
  const id = sanitizeSessionId(sessionId)
  const removed = Boolean(id) && items.some((item) => item.sessionId === id)
  return {
    items: removed ? items.filter((item) => item.sessionId !== id) : items,
    starred: false,
    changed: removed,
  }
}

export function toggleSession(items, input, now = new Date().toISOString()) {
  const sessionId = sanitizeSessionId(input && input.sessionId)
  if (!sessionId) throw new Error('sessionId is required')
  if (findStar(items, sessionId)) {
    const result = unstarSession(items, sessionId)
    return { ...result, item: undefined }
  }
  return starSession(items, { ...input, sessionId }, now)
}

/** Rows for the panel; keeps the file order (newest star first). */
export function toPublicItems(items) {
  return sortStars(items).map((item) => ({
    sessionId: item.sessionId,
    title: item.title,
    cwd: item.cwd,
    starredAt: item.starredAt,
  }))
}
