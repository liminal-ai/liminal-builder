# Story 5: Tab Management

## Overview

Story 5 implements the tab bar, iframe lifecycle, and the critical postMessage relay that connects the shell WebSocket to portlet iframes. This is the **integration milestone** — the first story where the full end-to-end chat path works: create session → tab opens → type message → response streams back.

Tabs provide instant switching between open sessions. Each open session gets a tab in the tab bar and a corresponding portlet iframe in the container. The critical design: iframes stay alive when hidden (`display: none`), so switching tabs is a CSS visibility toggle achieving sub-100ms switching with no re-fetch or re-render.

The tab system handles deduplication (clicking a sidebar session already in a tab activates the existing tab), drag-and-drop reorder via native HTML5 API, adjacent-tab activation on close, and full state persistence in localStorage. On app restart (including full server restart), tabs restore from localStorage because tab state is a client-side concern.

The **postMessage relay** in shell.js bridges the WebSocket and portlet iframes bidirectionally: WebSocket messages route to the correct iframe via `postMessage`, and portlet `postMessage` events route back to the WebSocket with the `sessionId` injected. The relay uses the iframe Map owned by `tabs.js` for lookup in both directions.

Tab logic lives in `client/shell/tabs.js`. The iframe Map (`Map<sessionId, iframe>`) is the source of truth for which sessions are currently tabbed. The relay logic lives in `client/shell/shell.js`.

## Prerequisites

- Stories 0-4 complete: all prior tests passing (`bun run verify` exits 0)
- Working directory: `/Users/leemoore/code/liminal-builder`
- `client/shell/tabs.js` exists as a stub (from Story 0)
- `client/shell/index.html` has tab bar and portlet container elements
- `client/shell/shell.js` has WebSocket connection and message routing

## ACs Covered

| AC | Description | TCs |
|----|-------------|-----|
| AC-4.1 | Opening a session creates a tab | TC-4.1a, TC-4.1b |
| AC-4.2 | Tab switch within 100ms, preserves scroll | TC-4.2a |
| AC-4.3 | Opening already-tabbed session activates existing tab | TC-4.3a, TC-4.3b |
| AC-4.4 | Close tab without losing session | TC-4.4a, TC-4.4b, TC-4.4c |
| AC-4.5 | Tabs display title and CLI type | TC-4.5a, TC-4.5b |
| AC-4.6 | Drag-and-drop reorder | TC-4.6a, TC-4.6b |
| AC-4.7 | Tabs restore on full app restart | TC-4.7a |

Note: TC-4.2b (tab switch within 100ms) is a manual/performance test, not automated. TC-5.6a (tabs restore after browser refresh) is covered in Story 6. The 4 relay tests do not map to specific TCs — they cover the cross-story integration glue (shell.js postMessage relay) that connects Stories 3 and 4 to the tab/iframe lifecycle.

## Files

### New Files

| File | Contents |
|------|----------|
| `tests/client/tabs.test.ts` | 18 tests covering tab bar and relay behavior |

### Modified Files

| File | Changes |
|------|---------|
| `client/shell/tabs.js` | Full implementation replacing stub. Exports `getIframe(sessionId)` and `getSessionIdBySource(contentWindow)` for relay lookup. |
| `client/shell/shell.js` | PostMessage relay: WS→portlet dispatch, portlet→WS listener with sessionId injection. Auto-open tab on `session:created`. Pass WebSocket send function to `initTabs()`. |
| `client/shell/shell.css` | Tab bar styles (tab elements, drag states, active indicator) |

### Existing Files (unchanged, for reference)

| File | Role |
|------|------|
| `client/shell/index.html` | Shell page with tab bar container and portlet container |
| `client/shared/constants.js` | CLI type constants |

## Test Breakdown

| TC | Test Name | Setup | Assert |
|----|-----------|-------|--------|
| TC-4.1a | New tab on session open | Open session | Tab element + iframe created |
| TC-4.1b | Multiple tabs | Open two sessions | Two tabs, second active |
| TC-4.2a | Scroll preserved on switch | Scroll A, switch B, back A | A at same scroll position |
| TC-4.3a | Sidebar deduplicates | Open existing session | Same tab activated, no new iframe |
| TC-4.3b | Tab count constant | 3 tabs, click existing | Still 3 tabs |
| TC-4.4a | Close removes tab and iframe | Click close | Both removed |
| TC-4.4b | Close active switches to adjacent | Close middle tab | Next tab activated |
| TC-4.4c | Close last tab shows empty state | Close only tab | Empty state shown |
| TC-4.5a | Tab shows title and CLI type | CC session | Title + CLI indicator visible |
| TC-4.5b | New session shows placeholder title | Open new session | Tab shows "New Session" |
| TC-4.6a | Drag reorder | Drag C between A and B | Order: A, C, B |
| TC-4.6b | Order persists | Reorder, check storage | localStorage updated |
| TC-4.7a | Tabs restore | Set localStorage, init | Tabs restored |
| TC-2.3b | Open already-tabbed session activates existing tab | Session in tab, open again | Existing tab activated |
| -- | WS message routes to correct portlet iframe | Two tabs open, send session:update for one | Correct iframe receives postMessage, other does not |
| -- | Portlet postMessage reaches WS with sessionId | Portlet posts session:send | WS send called with sessionId injected |
| -- | session:created auto-opens tab | Receive session:created via WS | openTab() called with sessionId, title, cliType |
| -- | Messages for unknown sessions silently dropped | session:update for non-tabbed session | No error, no postMessage sent |

**Story 5 test count: 18**

| Phase | This Story | Cumulative |
|-------|-----------|------------|
| Previous (Stories 0-4) | -- | 69 |
| Story 5 | 18 | 87 |

## Prompts

| Prompt | Phase | Description |
|--------|-------|-------------|
| `prompt-5.1-skeleton-red.md` | Skeleton + Red | tabs.js stubs with iframe Map + shell.js relay stubs + 18 failing tests |
| `prompt-5.2-green.md` | Green | Full tabs.js implementation + shell.js relay implementation |
| `prompt-5.R-verify.md` | Verify | All 87 tests pass, typecheck clean, manual tab + end-to-end chat verification |

## Exit Criteria

- 87 tests PASS total (69 previous + 18 new)
- `bun run typecheck` passes with zero errors
- `bun run verify` passes
- tabs.js can: open tabs with iframes, switch via CSS toggle, deduplicate, close with adjacent activation, display title/CLI type, drag-and-drop reorder, persist/restore from localStorage
- shell.js relay works: WebSocket messages route to correct portlet iframe via postMessage, portlet postMessages route to WebSocket with sessionId injected
- shell.js relay handles portlet:ready and portlet:title locally (NOT forwarded to WS)
- session:created auto-opens a tab (first time the end-to-end chat path is functional)

## Known Limitation (deferred to Story 6)

`agent:status` messages from the server carry `cliType` (not `sessionId`) and require broadcast to ALL portlet iframes of the matching CLI type. The `routeToPortlet` function in Story 5 intentionally does NOT handle `agent:status` — it only routes session-scoped messages by `sessionId`. Story 6 owns implementing the `agent:status` broadcast path to portlets as part of connection status indicator work.
