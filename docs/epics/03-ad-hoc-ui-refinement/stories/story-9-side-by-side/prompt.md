# Story 9: Side-by-Side View — Pairing Session Prompt

## Project Context

**Liminal Builder** is an agentic IDE wrapping multiple AI coding CLIs (Claude Code, Codex) in a unified browser interface. The core value proposition is multi-CLI orchestration — using different agents for different cognitive tasks (e.g. Opus for ideation/planning/spec writing, Codex for implementation/verification) and moving fluidly between them.

**Architecture:** Bun + Fastify server, vanilla HTML/JS client. Shell/portlet model — each session lives in its own iframe. The shell manages a single WebSocket connection, sidebar navigation, and routes messages to portlet iframes via `postMessage`. Currently only one portlet is visible at a time (others are `display:none`).

**Typical workflow:** The user orchestrates between Claude Code and Codex sessions on the same project — reviewing spec output in one, prompting implementation in the other. Currently this means switching back and forth via the sidebar — one session visible at a time.

## Current Message Routing (Verified)

Understanding how the shell routes messages is critical for split view:

**Server → portlet (session-scoped messages):**
- `shell.js routeToPortlet(message)` (line 161): checks `PORTLET_MESSAGE_TYPES` set (session:history, session:upsert, session:turn, session:error), looks up iframe via `getIframe(message.sessionId)`, posts to that specific iframe's `contentWindow`. This is already **sessionId-routed** — it doesn't assume a single active portlet. It sends to the correct iframe regardless of which is visible.

**Server → portlet (broadcast messages):**
- `shell.js broadcastToPortlets(message)` (line 185): iterates all open session iframes and posts to each. Used for `agent:status` messages. After Story 1 (remove tabs), this will iterate the iframes Map instead of `getTabOrder()`.

**Portlet → server:**
- `shell.js setupPortletRelay()` (line 100): listens for postMessage from any portlet iframe. Uses `getSessionIdBySource(event.source)` to determine which session sent the message, then injects sessionId and forwards to WebSocket. This also works regardless of which portlet is active — it identifies the sender by `contentWindow` reference.

**Key insight:** The routing is already multi-session capable. `routeToPortlet` and `setupPortletRelay` both work by sessionId/source lookup, not by "active portlet" assumption. The main thing that's single-session is the **visibility toggle** — showing one iframe and hiding others.

## Key Files

- `client/shell/index.html` — Shell layout: `#portlet-container` (line 37) holds all portlet iframes. Currently a simple container. Would need to support split layout (flexbox or grid with two slots).
- `client/shell/shell.js` — Message routing (verified above). `routeToPortlet` (line 161), `broadcastToPortlets` (line 185), `setupPortletRelay` (line 100). After Story 1, will also contain iframe management (currently in tabs.js). The session activation logic (show one, hide others) would need a split-aware mode.
- `client/shell/sidebar.js` — Session click handlers. Currently activating a session hides all others and shows one. Would need a way to target "left pane" vs "right pane."
- `client/shell/shell.css` — Layout styling. `.shell-layout`, `.main-area`, `.portlet-container`. Currently simple column layout.
- `client/shell/sidebar-resizer.js` — Existing drag-to-resize for sidebar (157 lines). Uses mousedown/move/up events, clamping, localStorage persistence, ARIA attributes. **Good pattern reference** for a split-pane divider — same mechanics, different axis (or same axis, different element).
- `client/portlet/portlet.js` — Each iframe is self-contained: own postMessage handling, own session state, own chat container. No awareness of other portlets. This is good — split view doesn't require portlet changes.

## What We're Working On

Adding a split-pane view that allows two sessions to be visible simultaneously.

Areas to explore:
- **Split layout:** Two portlet iframes side by side. Probably vertical split (left/right) given typical screen widths. The `#portlet-container` would switch from showing one iframe to showing two with a divider.
- **Activation model:** How does the user put a session into the second pane? Options: drag from sidebar, right-click "Open in split", a dedicated split button, modifier-click (e.g. Cmd+click). [OPEN: discuss what feels natural.]
- **Focus/input routing:** Both panes are live sessions with their own input bars. The user can type in either. Focus follows click naturally since they're iframes. But keyboard shortcuts (if any are added later) would need to know which pane is focused.
- **Resize:** Draggable divider between panes. `sidebar-resizer.js` provides the exact pattern — mousedown/move/up with clamping, persistence, ARIA.
- **Exit split:** How to return to single-pane. Close one side? A toggle? Dragging the divider fully to one side?

## Things to Consider

- **The routing already works.** `routeToPortlet` sends to the right iframe by sessionId. `setupPortletRelay` identifies senders by contentWindow. Showing two iframes instead of one requires no changes to message routing. This is the architectural win of the iframe-per-session model.
- **The main work is layout + activation.** The `#portlet-container` needs to support a split mode (probably a CSS class toggle + flexbox). The sidebar click behavior needs a way to target panes. And there needs to be a divider element with drag behavior.
- **Screen real estate:** Sidebar (~260px default) + two chat panes + two input bars. On a 1440px screen that's ~590px per pane. Workable but tight. On smaller screens it may not make sense. Consider a minimum width threshold for split mode.
- **State persistence:** Should the split state (which sessions, divider position) persist across reload? Probably yes, similar to sidebar width persistence.
- **Dependency on Story 1:** This story assumes tabs are removed and iframe management lives in shell.js (or a focused module). The activation/visibility logic being modified here is the same logic Story 1 reworks.
- **Lower priority than rendering quality.** Get content looking good (Stories 4-6) before investing in layout for viewing two streams of content side by side.

## Confidence Notes

What's verified (read the code):
- `routeToPortlet` routes by sessionId lookup, not active-portlet assumption — confirmed at shell.js lines 161-178.
- `setupPortletRelay` identifies sender by `getSessionIdBySource(event.source)` — confirmed at shell.js line 122.
- `broadcastToPortlets` iterates all open sessions — confirmed at shell.js line 185-193.
- Portlet iframes are self-contained, no awareness of other portlets — confirmed by reading portlet.js.
- sidebar-resizer.js pattern: mousedown/move/up, clamping, localStorage, ARIA, cleanup function — confirmed (157 lines, well-structured).
- `#portlet-container` is a plain div — confirmed in index.html line 37.

What needs verification in session:
- Whether there are any CSS or JS assumptions about a single visible iframe that would break with two visible. (~75% confident it's clean — `routeToPortlet` doesn't check visibility, and iframes render independently. But there may be `autoScroll` or focus-related assumptions.)
- Whether showing two iframes with `display:block` causes any performance issues (two active rendering contexts). (~85% confident it's fine — browsers handle multiple visible iframes routinely.)
- What the actual sidebar-resizer.js pattern looks like when adapted for a horizontal split between two iframes vs. the current sidebar/main split. The mechanics are identical but the CSS integration differs. (Straightforward but untested.)

## Session Style

This is an interactive pairing session. The scope is larger and more architectural than the rendering stories. We'll discuss the interaction model, prototype the layout, and figure out the activation/routing changes. The user has strong opinions on the workflow this needs to serve — the design should follow from how multi-CLI orchestration actually works in practice.
