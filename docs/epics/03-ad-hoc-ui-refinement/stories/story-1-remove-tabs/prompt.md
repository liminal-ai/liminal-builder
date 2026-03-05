# Story 1: Remove Tabs — Pairing Session Prompt

## Project Context

**Liminal Builder** is an agentic IDE that wraps multiple AI coding CLIs (Claude Code via the Agent SDK, Codex via ACP/JSON-RPC) in a unified browser-based interface. It lets you manage projects, create sessions across different CLIs, and interact with them through a chat UI.

**Architecture:** Bun + Fastify server, vanilla HTML/JS client (no framework). The client uses a shell/portlet model — a main shell page manages the sidebar, tab bar, and a single WebSocket connection. Each open session lives in its own iframe (portlet) that communicates with the shell via `postMessage`.

**Stack:** Bun runtime, Fastify 5, vanilla JS client, marked + DOMPurify for markdown, Tailwind + custom CSS theming (Tokyo Night / Codex Dark / Warm Minimal).

## What We're Working On

Removing the tab bar from the shell. The sidebar already provides session navigation via project-grouped session lists with collapse/expand. Tabs are adding complexity and consuming vertical space without clear benefit — the sidebar covers the same navigation with recency sorting and project-level grouping.

## Key Files

- `client/shell/index.html` — Shell layout, contains the `#tab-bar` nav element and `#portlet-container` with `#empty-state`
- `client/shell/tabs.js` — **Owns both tab UI and iframe lifecycle.** Tab create/close/activate/reorder, but also `createIframe()`, `getIframe()`, `getSessionIdBySource()`. ~620 lines. This is the main file being removed, but the iframe management it contains needs to survive somewhere.
- `client/shell/shell.js` — Heavily depends on tabs.js. Imports: `getActiveTab`, `getIframe`, `getSessionIdBySource`, `getTabOrder`, `initTabs`, `openTab`, `updateTabTitle`. Key consumers:
  - `routeToPortlet()` uses `getIframe(sessionId)` to find target iframe
  - `broadcastToPortlets()` iterates `getTabOrder()` to reach all open portlets
  - `handleServerMessage()` calls `openTab()` on `session:created`
  - `setupPortletRelay()` uses `getSessionIdBySource()` for reverse-lookup
  - Custom events `liminal:resync-open-tabs` and `liminal:tab-activated` are tab-specific patterns
- `client/shell/shell.css` — Tab bar styling (`.tab-bar`, `.tab`, `.tab-active`, etc.)
- `client/shell/sidebar.js` — Session list rendering, click-to-open handlers. Currently delegates to `openTab()` via shell — after this change, sidebar clicks need to drive session activation directly.
- `client/shared/constants.js` — `STORAGE_KEYS.TABS` ("liminal:tabs") — can be removed or repurposed
- `tests/client/tabs.test.ts` — Dedicated tab tests, can be removed
- `tests/client/sidebar.test.ts` — May reference tab-dependent behavior
- `tests/client/portlet.test.ts` — May reference tab-dependent shell interactions

## The Core Problem

tabs.js conflates two concerns: **tab bar UI** (rendering tabs, drag-reorder, highlight active) and **session iframe management** (create iframe, track by sessionId, lookup by source window, show/hide). Removing tabs means separating these — the tab bar UI goes away, but the iframe management needs to live somewhere (likely shell.js directly or a small focused module).

Functions from tabs.js that must survive in some form:
- `createIframe(sessionId)` — creates and appends portlet iframe
- `getIframe(sessionId)` — lookup for message routing
- `getSessionIdBySource(source)` — reverse-lookup for postMessage relay
- `activateTab(sessionId)` logic (show one iframe, hide others) — the activation concept survives, just driven by sidebar instead of tab clicks
- Some form of tracking which sessions are open (currently `tabOrder` array + `iframes` Map)

Functions that can be removed entirely:
- `renderTabElement()`, `removeTabElement()`, `updateTabBarHighlight()` — tab bar DOM
- `setupDragHandlers()`, `reorderTabs()`, `reorderTabBarDOM()` — drag-reorder
- `persistTabState()`, `restoreTabState()` — localStorage tab persistence (may be replaced with simpler active-session persistence)

## Things to Consider

- Sidebar click should activate the session directly (show its iframe, hide others). The sidebar already has click handlers — they currently go through shell to tabs. The path needs to be simplified.
- `broadcastToPortlets()` in shell.js iterates `getTabOrder()` for agent:status broadcasts. After removal, the straightforward fix is iterating the `iframes` Map directly instead of going through a tab order array.
- The `liminal:resync-open-tabs` and `liminal:tab-activated` custom event patterns in shell.js are tab-specific and need rethinking.
- localStorage persistence: tab state (`liminal:tabs`) can be removed. Consider whether to persist the last-active session ID so reload reopens it.
- The `#empty-state` element (shown when no sessions are open) should survive — it's useful independent of tabs.
- The `#tab-bar` nav element in index.html gets removed from the DOM.

## Confidence Notes

What's verified (read the code):
- shell.js imports from tabs.js — exact import list and usage sites confirmed.
- tabs.js owns `createIframe()`, `getIframe()`, `getSessionIdBySource()` — confirmed, these are not duplicated elsewhere.
- `broadcastToPortlets()` depends on `getTabOrder()` — confirmed at shell.js line 186.
- `handleServerMessage()` calls `openTab()` on `session:created` — confirmed at shell.js line 212.
- `STORAGE_KEYS.TABS` exists in constants.js — confirmed.
- `tests/client/tabs.test.ts` exists — confirmed.
- portlet.js does NOT reference tabs — confirmed, it only communicates via postMessage.

What's likely but needs verification:
- **Sidebar click path** (~85% confident): sidebar.js receives `sendMessage` as a callback during init and likely calls `sendMessage({ type: "session:open", sessionId })` on session click, which goes to the server, which responds with a message that shell.js routes. But it may also call `openTab()` directly — need to read sidebar.js to confirm the exact click handler chain.
- **shell.css tab styling scope** (~90% confident): Tab-related CSS classes (`.tab-bar`, `.tab`, `.tab-active`, `.tab-cli-indicator`, `.tab-title`, `.tab-close`, `.dragging`) are likely self-contained and removable without affecting other styles. But should verify no shared utility classes are only defined in the tab section.
- **sidebar.test.ts and portlet.test.ts impact** (~70% confident): These tests likely don't directly import from tabs.js, but they may set up DOM fixtures or mock interactions that assume tabs exist. Need to read the test files to know if they break.
- **Whether `updateTabTitle` is called from anywhere besides shell.js** (~80% confident): shell.js calls it from `setupPortletRelay` on `portlet:title` messages. Probably the only call site, but should verify with a grep.

## Session Style

This is an interactive pairing session. We'll discuss approaches, make decisions together, and implement incrementally. The user has strong opinions on UX and will guide direction — bring implementation knowledge and flag tradeoffs.
