/**
 * dsh-session-stars — Client half.
 *
 * Three row hooks and one panel, all through public Slot APIs:
 *   sidebar.workspaces.session.row.action  the hover star button
 *   sidebar.session.row.trailing           always-on marker for a starred row
 *   sidebar.workspaces.session.menu.item   the touch/menu twin of that button
 *   sidebar.panellist + main               the "星标" entry and its page
 *
 * The Host half owns the data. This file keeps a tiny reactive cache of the
 * last state it received (`store`), so every row can answer "is this starred?"
 * without a request of its own.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-stars',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useState } = React

    const NS = 'sessionStars'
    const PANEL_ID = 'session-stars'
    const API_STATE = '/api/session-stars/state'
    const API_OP = '/api/session-stars/op'
    const OP_HEADERS = { 'content-type': 'application/json', 'x-dsh-session-stars': '1' }

    // ------------------------------------------------------------------ i18n

    const DICT = {
      zh: {
        title: '星标',
        panelTitle: '星标会话',
        panelHint: '只列出你加过星标的会话',
        refresh: '刷新',
        loading: '正在读取…',
        empty: '还没有星标会话',
        emptyHint: '把鼠标移到左侧任意会话上，点行尾的星标按钮。',
        error: '读取失败：{error}',
        star: '加星标',
        unstar: '取消星标',
        starred: '已加星标',
        gone: '会话不可用',
        ungroupped: '未归类',
        count: '{n} 个',
        starredAt: '加星于 {time}',
      },
      en: {
        title: 'Starred',
        panelTitle: 'Starred sessions',
        panelHint: 'Only the sessions you starred',
        refresh: 'Refresh',
        loading: 'Loading…',
        empty: 'No starred sessions yet',
        emptyHint: 'Hover any session in the sidebar and press the star at its right edge.',
        error: 'Could not load: {error}',
        star: 'Star session',
        unstar: 'Remove star',
        starred: 'Starred',
        gone: 'Session unavailable',
        ungroupped: 'Ungrouped',
        count: '{n}',
        starredAt: 'Starred {time}',
      },
    }

    /** Locale service first (so the text follows the app language), then the local table. */
    function makeTranslator(ctx) {
      let bound = null
      try {
        if (ctx.locale && typeof ctx.locale.register === 'function') ctx.locale.register(NS, DICT)
      } catch {
        /* the local table still covers both languages */
      }
      try {
        if (ctx.locale && typeof ctx.locale.bind === 'function') bound = ctx.locale.bind(NS)
      } catch {
        bound = null
      }
      const language = () => {
        try {
          const snapshot = ctx.locale && typeof ctx.locale.getLocale === 'function' ? ctx.locale.getLocale() : null
          const id = String((snapshot && (snapshot.id || snapshot.locale || snapshot.language)) || '')
          return /^en/i.test(id) ? 'en' : 'zh'
        } catch {
          return 'zh'
        }
      }
      return function translate(key, params) {
        if (bound) {
          try {
            const text = bound(key, params)
            if (text && text !== key) return text
          } catch {
            /* fall through */
          }
        }
        const table = DICT[language()] || DICT.zh
        const raw = table[key] != null ? table[key] : DICT.zh[key] != null ? DICT.zh[key] : key
        if (!params) return raw
        return String(raw).replace(/\{(\w+)\}/g, (match, name) => (params[name] != null ? String(params[name]) : match))
      }
    }

    // ----------------------------------------------------------------- state

    const store = { ready: false, loading: false, error: '', items: [], ids: new Set(), version: 0 }
    const listeners = new Set()

    let translate = (key) => key

    function emit() {
      store.version += 1
      for (const listener of Array.from(listeners)) {
        try {
          listener()
        } catch {
          /* a broken row must not break the rest */
        }
      }
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }

    function accept(payload) {
      const items = payload && Array.isArray(payload.items) ? payload.items : []
      store.items = items
      store.ids = new Set(items.map((item) => item.sessionId).filter(Boolean))
      store.ready = true
      store.error = ''
      emit()
    }

    async function refresh() {
      if (store.loading) return
      store.loading = true
      emit()
      try {
        const response = await fetch(API_STATE, { headers: { accept: 'application/json' } })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        accept(await response.json())
      } catch (error) {
        store.error = String((error && error.message) || error)
        store.ready = true
      } finally {
        store.loading = false
        emit()
      }
    }

    /**
     * Optimistic toggle. The row flips immediately; a failed request restores
     * the previous membership and surfaces the message in the panel.
     */
    async function toggle(sessionId, title) {
      if (!sessionId) return undefined
      const wasStarred = store.ids.has(sessionId)
      if (wasStarred) store.ids.delete(sessionId)
      else store.ids.add(sessionId)
      emit()
      try {
        const response = await fetch(API_OP, {
          method: 'POST',
          headers: OP_HEADERS,
          body: JSON.stringify({ op: 'toggle', sessionId, title: title || '' }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data || data.ok === false) {
          throw new Error((data && data.error) || `HTTP ${response.status}`)
        }
        accept(data.value || data)
        return data.value ? Boolean(data.value.starred) : undefined
      } catch (error) {
        if (wasStarred) store.ids.add(sessionId)
        else store.ids.delete(sessionId)
        store.error = String((error && error.message) || error)
        emit()
        return undefined
      }
    }

    function useStore() {
      const [, bump] = React.useReducer((value) => value + 1, 0)
      useEffect(() => subscribe(bump), [])
      return store
    }

    // ------------------------------------------------------------------ icons

    const STAR_PATH =
      'M12 2.4l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.42l-5.88 3.09 1.12-6.55L2.48 9.32l6.58-.96z'

    function StarGlyph(props) {
      const size = typeof props.size === 'number' ? props.size : 14
      const filled = Boolean(props.filled)
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: filled ? 'currentColor' : 'none',
          stroke: 'currentColor',
          strokeWidth: filled ? 0 : 1.6,
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block', ...(props.style || {}) },
        },
        h('path', { d: STAR_PATH }),
      )
    }

    /** The glyph only: the sidebar owns the clickable button around a panel entry. */
    function PanelIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 18
      return h(StarGlyph, {
        size,
        filled: Boolean(props.active),
        style: props.active ? { color: 'var(--dsw-alias-brand-primary, currentColor)' } : null,
      })
    }

    // -------------------------------------------------------------- row parts

    function RowStarButton(props) {
      const state = useStore()
      const [busy, setBusy] = useState(false)
      const sessionId = props.sessionId
      if (!sessionId) return null
      const starred = state.ids.has(sessionId)
      const label = starred ? translate('unstar') : translate('star')
      return h(
        'button',
        {
          type: 'button',
          className: `dss-row-star${starred ? ' dss-on' : ''}`,
          title: label,
          'aria-label': label,
          'aria-pressed': starred,
          disabled: busy,
          onClick: (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (busy) return
            setBusy(true)
            Promise.resolve(toggle(sessionId, props.displayTitle)).finally(() => setBusy(false))
          },
        },
        h(StarGlyph, { size: 14, filled: starred }),
      )
    }

    function RowStarMark(props) {
      const state = useStore()
      if (!props.sessionId || !state.ids.has(props.sessionId)) return null
      const label = translate('unstar')
      // A starred row keeps this star on screen without hover, and it toggles:
      // the hover strip hides as soon as the pointer leaves the row, so this is
      // the one affordance that stays visible (and clickable) after starring.
      return h(
        'button',
        {
          type: 'button',
          className: 'dss-row-mark',
          title: label,
          'aria-label': label,
          'aria-pressed': true,
          onClick: (event) => {
            event.preventDefault()
            event.stopPropagation()
            Promise.resolve(toggle(props.sessionId, props.displayTitle))
          },
        },
        h(StarGlyph, { size: 13, filled: true }),
      )
    }

    function MenuStarItem(props) {
      const state = useStore()
      const starred = Boolean(props.sessionId) && state.ids.has(props.sessionId)
      let closeMenu = () => {}
      try {
        if (typeof props.useMenuOpenState === 'function') {
          const api = props.useMenuOpenState()
          if (api && typeof api[1] === 'function') closeMenu = api[1]
        }
      } catch {
        /* the menu closes itself on selection in newer builds */
      }
      return h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          className: 'dss-menu-star',
          onClick: () => {
            closeMenu(false)
            Promise.resolve(toggle(props.sessionId, props.displayTitle))
          },
        },
        h(StarGlyph, { size: 14, filled: starred, style: { marginRight: 8, flex: '0 0 auto' } }),
        h('span', null, starred ? translate('unstar') : translate('star')),
      )
    }

    // -------------------------------------------------------------- the panel

    function baseName(path) {
      const text = String(path || '').replace(/[\\/]+$/, '')
      if (!text) return ''
      const parts = text.split(/[\\/]/)
      return parts[parts.length - 1] || text
    }

    function formatWhen(iso) {
      const time = Date.parse(iso)
      if (!Number.isFinite(time)) return ''
      try {
        return new Date(time).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      } catch {
        return new Date(time).toISOString().slice(0, 16).replace('T', ' ')
      }
    }

    function groupByWorkspace(items) {
      const groups = new Map()
      for (const item of items) {
        const key = item.workspaceTitle || item.cwd || ''
        if (!groups.has(key)) {
          groups.set(key, {
            key: key || '__ungrouped__',
            title: item.workspaceTitle || (item.cwd ? baseName(item.cwd) : '') || translate('ungroupped'),
            path: item.cwd || '',
            items: [],
          })
        }
        groups.get(key).items.push(item)
      }
      return Array.from(groups.values())
    }

    function StarRow(props) {
      const item = props.item
      const [busy, setBusy] = useState(false)
      const title = item.title || baseName(item.cwd) || item.sessionId.slice(0, 12)
      return h(
        'div',
        { className: 'dss-row' },
        h('span', { className: 'dss-row-glyph' }, h(StarGlyph, { size: 15, filled: true })),
        h(
          'div',
          { className: 'dss-row-body' },
          h('div', { className: 'dss-row-title', title }, title),
          h(
            'div',
            { className: 'dss-row-meta' },
            h('span', null, translate('starredAt', { time: formatWhen(item.starredAt) })),
            item.alive === false ? h('span', { className: 'dss-tag' }, translate('gone')) : null,
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dss-ghost',
            disabled: busy,
            onClick: () => {
              setBusy(true)
              Promise.resolve(toggle(item.sessionId, item.title)).finally(() => setBusy(false))
            },
          },
          translate('unstar'),
        ),
      )
    }

    function StarsPanel() {
      const state = useStore()
      useEffect(() => {
        refresh()
      }, [])
      const groups = useMemo(() => groupByWorkspace(state.items), [state.items])
      const count = state.items.length
      return h(
        'div',
        { className: 'dss-page' },
        h(
          'div',
          { className: 'dss-inner' },
          h(
            'div',
            { className: 'dss-head' },
            h('h1', { className: 'dss-title' }, translate('panelTitle')),
            count > 0 ? h('span', { className: 'dss-count' }, translate('count', { n: count })) : null,
            h('span', { className: 'dss-spacer' }),
            h(
              'button',
              { type: 'button', className: 'dss-ghost', onClick: () => refresh(), disabled: state.loading },
              translate('refresh'),
            ),
          ),
          h('p', { className: 'dss-hint' }, translate('panelHint')),
          state.error ? h('div', { className: 'dss-error', role: 'alert' }, translate('error', { error: state.error })) : null,
          !state.ready ? h('div', { className: 'dss-empty' }, h('div', { className: 'dss-empty-title' }, translate('loading'))) : null,
          state.ready && count === 0
            ? h(
                'div',
                { className: 'dss-empty' },
                h('div', { className: 'dss-empty-title' }, translate('empty')),
                h('div', { className: 'dss-empty-hint' }, translate('emptyHint')),
              )
            : null,
          groups.map((group) =>
            h(
              'section',
              { className: 'dss-group', key: group.key },
              h(
                'div',
                { className: 'dss-group-head' },
                h('span', { className: 'dss-group-name', title: group.title }, group.title),
                group.path ? h('span', { className: 'dss-group-path', title: group.path }, group.path) : null,
              ),
              group.items.map((item) => h(StarRow, { key: item.sessionId, item })),
            ),
          ),
        ),
      )
    }

    // -------------------------------------------------------------- the styles

    const CSS = [
      '.dss-row-star{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:2px;',
      'border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#9a9a9a);',
      'cursor:pointer;opacity:.75}',
      '.dss-row-star:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}',
      '.dss-row-star.dss-on{color:var(--dsw-alias-brand-primary,#2f6fe0);opacity:1}',
      '.dss-row-star:disabled{opacity:.4;cursor:default}',
      '.dss-row-mark{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;',
      'padding:0;border:none;border-radius:5px;background:transparent;margin-left:2px;cursor:pointer;',
      'color:var(--dsw-alias-brand-primary,#2f6fe0);opacity:.95}',
      '.dss-row-mark:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}',
      '.dss-row-mark:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2f6fe0);outline-offset:1px}',
      '.dss-menu-star{display:flex;align-items:center;width:100%;border:none;background:transparent;color:inherit;',
      'font:inherit;font-size:13px;line-height:1.4;padding:6px 10px;border-radius:6px;cursor:pointer;text-align:left}',
      '.dss-menu-star:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}',
      '.dss-page{height:100%;overflow:auto;box-sizing:border-box;background:var(--dsw-alias-bg-base,#fff);',
      'color:var(--dsw-alias-label-primary,#1a1a1c);',
      'font:15px/1.5 var(--dsw-alias-font-family,system-ui,-apple-system,"Segoe UI",sans-serif)}',
      '.dss-inner{max-width:760px;margin:0 auto;padding:20px 20px 96px}',
      '.dss-head{display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:2;',
      'background:var(--dsw-alias-bg-base,#fff);padding:4px 0 10px}',
      '.dss-title{margin:0;font-size:20px;font-weight:600;letter-spacing:.01em}',
      '.dss-count{font-size:12px;padding:1px 8px;border-radius:999px;',
      'background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.06));color:var(--dsw-alias-label-secondary,rgba(0,0,0,.55))}',
      '.dss-spacer{flex:1}',
      '.dss-hint{margin:0 0 14px;font-size:13px;color:var(--dsw-alias-label-secondary,rgba(0,0,0,.55))}',
      '.dss-ghost{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));background:transparent;',
      'color:var(--dsw-alias-label-secondary,rgba(0,0,0,.6));font:inherit;font-size:12px;line-height:1;',
      'height:26px;padding:0 10px;border-radius:7px;cursor:pointer}',
      '.dss-ghost:hover{color:var(--dsw-alias-label-primary,#1a1a1c);border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.24))}',
      '.dss-ghost:disabled{opacity:.5;cursor:default}',
      '.dss-error{margin:0 0 12px;padding:8px 10px;border-radius:8px;font-size:13px;',
      'color:var(--dsw-alias-state-error-primary,#c0392b);background:rgba(220,60,60,.1)}',
      '.dss-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:56px 16px;text-align:center;',
      'color:var(--dsw-alias-label-secondary,rgba(0,0,0,.55))}',
      '.dss-empty-title{font-size:15px;color:var(--dsw-alias-label-primary,#1a1a1c)}',
      '.dss-empty-hint{font-size:13px;max-width:44ch}',
      '.dss-group{margin-top:16px}',
      '.dss-group-head{display:flex;align-items:baseline;gap:8px;padding:0 4px 6px;min-width:0}',
      '.dss-group-name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#1a1a1c);',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dss-group-path{font-size:12px;color:var(--dsw-alias-label-secondary,rgba(0,0,0,.5));',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
      '.dss-row{display:flex;align-items:center;gap:10px;min-height:52px;padding:9px 10px;border-radius:10px;',
      'border:1px solid transparent}',
      '.dss-row:hover{background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.035));',
      'border-color:var(--dsw-alias-border-l1,rgba(0,0,0,.06))}',
      '.dss-row-glyph{flex:0 0 auto;display:inline-flex;color:var(--dsw-alias-brand-primary,#2f6fe0)}',
      '.dss-row-body{flex:1;min-width:0}',
      '.dss-row-title{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dss-row-meta{display:flex;align-items:center;gap:8px;margin-top:2px;font-size:12px;',
      'color:var(--dsw-alias-label-secondary,rgba(0,0,0,.55))}',
      '.dss-tag{padding:0 6px;border-radius:999px;font-size:11px;background:rgba(180,140,30,.14);color:#a8791a}',
    ].join('')

    // ------------------------------------------------------------------ apply

    return {
      inject: ['slots'],
      apply(ctx) {
        translate = makeTranslator(ctx)

        // One stylesheet for every surface, removed when the plugin disposes.
        ctx.effect(() => {
          if (typeof document === 'undefined' || !document.head) return () => {}
          const element = document.createElement('style')
          element.id = 'dsh-session-stars-style'
          element.textContent = CSS
          document.head.appendChild(element)
          return () => {
            if (element.parentNode) element.parentNode.removeChild(element)
          }
        }, 'dsh-session-stars: stylesheet')

        // Cache once at load so rows can render their star state immediately.
        ctx.effect(() => {
          refresh()
          return () => {}
        }, 'dsh-session-stars: prime state')

        ctx.slots.inject('sidebar.workspaces.session.row.action', function* () {
          yield ctx.slots.register(
            { name: 'sidebar.workspaces.session.row.action', id: `${PANEL_ID}-toggle`, order: 150 },
            RowStarButton,
          )
        })

        ctx.slots.inject('sidebar.session.row.trailing', function* () {
          yield ctx.slots.register({ name: 'sidebar.session.row.trailing', id: `${PANEL_ID}-mark`, order: 10 }, RowStarMark)
        })

        ctx.slots.inject('sidebar.workspaces.session.menu.item', function* () {
          yield ctx.slots.register(
            { name: 'sidebar.workspaces.session.menu.item', id: `${PANEL_ID}-menu`, order: 380 },
            MenuStarItem,
          )
        })

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 3, label: () => translate('title'), locale: NS },
            PanelIcon,
          ),
        )

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, StarsPanel))
      },
    }
  },
})
