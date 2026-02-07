# Story 5: Tab Management

## Overview

Story 5 implements the tab bar and iframe lifecycle for Liminal Builder. Tabs provide instant switching between open sessions. Each open session gets a tab in the tab bar and a corresponding portlet iframe in the container. The critical design: iframes stay alive when hidden (`display: none`), so switching tabs is a CSS visibility toggle achieving sub-100ms switching with no re-fetch or re-render.

The tab system handles deduplication (clicking a sidebar session already in a tab activates the existing tab), drag-and-drop reorder via native HTML5 API, adjacent-tab activation on close, and full state persistence in localStorage. On app restart (including full server restart), tabs restore from localStorage because tab state is a client-side concern.

All tab logic lives in `client/shell/tabs.js`. The iframe Map (`Map<sessionId, iframe>`) is the source of truth for which sessions are currently tabbed.

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

Note: TC-4.2b (tab switch within 100ms) is a manual/performance test, not automated. TC-5.6a (tabs restore after browser refresh) is covered in Story 6.

## Files

### New Files

| File | Contents |
|------|----------|
| `tests/client/tabs.test.ts` | 14 tests covering tab bar behavior |

### Modified Files

| File | Changes |
|------|---------|
| `client/shell/tabs.js` | Full implementation replacing stub |
| `client/shell/shell.css` | Tab bar styles (tab elements, drag states, active indicator) |

### Existing Files (unchanged, for reference)

| File | Role |
|------|------|
| `client/shell/index.html` | Shell page with tab bar container and portlet container |
| `client/shell/shell.js` | WebSocket connection, message routing to tabs.js |
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

**Story 5 test count: 14**

| Phase | This Story | Cumulative |
|-------|-----------|------------|
| Previous (Stories 0-4) | -- | 58 |
| Story 5 | 14 | 72 |

## Prompts

| Prompt | Phase | Description |
|--------|-------|-------------|
| `prompt-5.1-skeleton-red.md` | Skeleton + Red | tabs.js stubs with iframe Map + 14 failing tests |
| `prompt-5.2-green.md` | Green | Full tabs.js implementation |
| `prompt-5.R-verify.md` | Verify | All 72 tests pass, typecheck clean, manual tab verification |

## Exit Criteria

- 72 tests PASS total (58 previous + 14 new)
- `bun run typecheck` passes with zero errors
- `bun run verify` passes
- tabs.js can: open tabs with iframes, switch via CSS toggle, deduplicate, close with adjacent activation, display title/CLI type, drag-and-drop reorder, persist/restore from localStorage
