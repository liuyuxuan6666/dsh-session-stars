import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_ITEMS,
  MAX_TITLE,
  emptyStore,
  findStar,
  normalizeStore,
  sanitizeSessionId,
  sanitizeTitle,
  sortStars,
  starSession,
  toggleSession,
  unstarSession,
} from '../lib/store.js'

const NOW = '2026-11-19T06:00:00.000Z'

test('normalizeStore rejects junk and keeps valid entries', () => {
  assert.deepEqual(normalizeStore(null, NOW), emptyStore(NOW))
  assert.deepEqual(normalizeStore({ items: 'nope' }, NOW), emptyStore(NOW))

  const store = normalizeStore(
    {
      items: [
        { sessionId: 'a', title: 'Alpha', starredAt: '2026-11-18T00:00:00.000Z' },
        { sessionId: '', title: 'broken' },
        { sessionId: 'a', title: 'Alpha renamed', starredAt: '2026-11-17T00:00:00.000Z' },
        { sessionId: 'b' },
        'not an object',
      ],
    },
    NOW,
  )
  assert.equal(store.items.length, 2)
  assert.equal(store.items[0].sessionId, 'b')
  assert.deepEqual(
    store.items.map((item) => item.sessionId),
    ['b', 'a'],
  )
  // The duplicate keeps the last value but a normalised timestamp.
  assert.equal(findStar(store.items, 'a').title, 'Alpha renamed')
  assert.equal(findStar(store.items, 'b').starredAt, NOW)
})

test('sanitize helpers bound their input', () => {
  assert.equal(sanitizeSessionId('  abc  '), 'abc')
  assert.equal(sanitizeSessionId(42), '')
  assert.equal(sanitizeSessionId('x'.repeat(201)), '')
  assert.equal(sanitizeTitle('a\nb\tc'), 'a b c')
  assert.equal(sanitizeTitle(''), '')
  assert.equal(sanitizeTitle('y'.repeat(MAX_TITLE + 50)).length, MAX_TITLE)
})

test('starSession is idempotent and keeps the first star time', () => {
  const first = starSession([], { sessionId: 's1', title: 'First' }, '2026-11-01T00:00:00.000Z')
  assert.equal(first.items.length, 1)
  assert.equal(first.starred, true)

  const again = starSession(first.items, { sessionId: 's1', title: 'Renamed' }, '2026-11-19T00:00:00.000Z')
  assert.equal(again.items.length, 1)
  assert.equal(again.items[0].starredAt, '2026-11-01T00:00:00.000Z')
  assert.equal(again.items[0].title, 'Renamed')
  assert.equal(again.changed, true)

  const unchanged = starSession(again.items, { sessionId: 's1', title: 'Renamed' }, '2026-11-19T00:00:00.000Z')
  assert.equal(unchanged.changed, false)
})

test('starSession requires a session id', () => {
  assert.throws(() => starSession([], {}, NOW), /sessionId/)
  assert.throws(() => toggleSession([], { sessionId: '   ' }, NOW), /sessionId/)
})

test('unstarSession removes only the requested star', () => {
  const items = [
    { sessionId: 'a', title: 'A', cwd: null, starredAt: '2026-11-02T00:00:00.000Z' },
    { sessionId: 'b', title: 'B', cwd: null, starredAt: '2026-11-03T00:00:00.000Z' },
  ]
  const removed = unstarSession(items, 'a')
  assert.deepEqual(
    removed.items.map((item) => item.sessionId),
    ['b'],
  )
  assert.equal(removed.changed, true)
  assert.equal(unstarSession(items, 'missing').changed, false)
})

test('toggleSession flips and reports the new state', () => {
  const on = toggleSession([], { sessionId: 's', title: 'T' }, NOW)
  assert.equal(on.starred, true)
  const off = toggleSession(on.items, { sessionId: 's' }, NOW)
  assert.equal(off.starred, false)
  assert.equal(off.items.length, 0)
})

test('sortStars is newest first', () => {
  const items = [
    { sessionId: 'old', title: '', cwd: null, starredAt: '2026-11-01T00:00:00.000Z' },
    { sessionId: 'new', title: '', cwd: null, starredAt: '2026-11-18T00:00:00.000Z' },
  ]
  assert.deepEqual(
    sortStars(items).map((item) => item.sessionId),
    ['new', 'old'],
  )
})

test('the store never grows past MAX_ITEMS', () => {
  let items = []
  for (let index = 0; index < MAX_ITEMS + 5; index += 1) {
    const result = starSession(
      items,
      { sessionId: `s${index}`, title: `T${index}` },
      new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
    )
    items = result.items
  }
  assert.equal(items.length, MAX_ITEMS)
  // The oldest stars are the ones that fall out.
  assert.equal(findStar(items, 's0'), undefined)
  assert.ok(findStar(items, `s${MAX_ITEMS + 4}`))
})
