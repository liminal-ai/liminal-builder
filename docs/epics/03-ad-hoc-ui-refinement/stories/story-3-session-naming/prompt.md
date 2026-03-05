# Story 3: Session Naming — Pairing Session Prompt

## Project Context

**Liminal Builder** is an agentic IDE that wraps multiple AI coding CLIs (Claude Code via the Agent SDK, Codex via ACP/JSON-RPC) in a unified browser-based interface. The left sidebar shows projects with sessions listed underneath. Sessions are the primary navigation unit.

**Architecture:** Bun + Fastify server, vanilla HTML/JS client. Server persists session metadata (including titles) in `~/.liminal-builder/sessions.json`. Titles have existing infrastructure — see "What Already Exists" below.

**Stack:** Bun runtime, Fastify 5, vanilla JS client, Tailwind + custom CSS theming.

## What Already Exists (Verified)

Title infrastructure is partially built:

**Server-side title derivation:**
- `SessionManager.deriveTitle(content)` (session-manager.ts line 326) — truncates the first user message to 50 chars at a word boundary. Called on `sendMessage()` only when the current title is "New Session" (line 228-231).
- `SessionManager.updateTitle(canonicalId, title)` (line 279) — sets title and persists. Public method, currently only called from `sendMessage` flow.
- `SessionPromptResult.titleUpdated` (session-types.ts line 55) — optional field set when title was derived.

**Server → client title flow:**
- websocket.ts `getDerivedTitle()` (line 120) — extracts `titleUpdated` from prompt result.
- After `session:send` completes, websocket.ts checks for a derived title and sends `{ type: "session:title-updated", sessionId, title }` (line 973-979).

**Client-side title handling:**
- sidebar.js handles `session:title-updated` messages (line 234) — updates session in `currentSessionsByProject` and re-renders.
- shell.js `setupPortletRelay()` handles `portlet:title` messages — calls `updateTabTitle()` (will change after Story 1 removes tabs).

**What's missing:**
- No `session:rename` or `session:suggest-title` client message type exists.
- No UI for user-initiated rename (no rename button, no modal, no inline edit).
- No auto-suggest mechanism — the current `deriveTitle` is just first-message truncation, not model-generated.
- Title derivation only happens once (first message). After that, titles are static.

## What We're Working On

Two capabilities converging on a single interaction:

- **Auto-suggest rename:** Call the session's backing model with a prompt asking it to generate a concise session name based on the conversation. The naming criteria are TBD but probably task-oriented, short, distinguishing.
- **Manual rename:** User clicks rename on a session, gets a modal with the current name pre-filled and text highlighted.
- **Single modal, two paths:** Whether triggered as "rename" or "auto-suggest," the user lands in the same modal. The difference is what's pre-populated — existing name vs. model-suggested name. Text is pre-selected so accepting or overriding is equally low-friction.

## Key Files

- `client/shell/sidebar.js` — Session list rendering. Each session item (line 403-460) currently has a CLI badge, title, timestamp, and archive button. Rename trigger would attach here. Already handles `session:title-updated` (line 234).
- `client/shell/shell.js` — WebSocket message relay. Would need to handle new `session:rename` / `session:suggest-title` messages or route them to the server.
- `server/sessions/session-manager.ts` — `updateTitle()` (line 279) already exists for setting titles. `deriveTitle()` (line 326) is the current first-message truncation. Auto-suggest would either extend this or be a separate path.
- `server/sessions/session-types.ts` — `SessionMeta.title` field exists. `SessionPromptResult.titleUpdated` for the derivation flow.
- `server/websocket.ts` — Routes messages, sends `session:title-updated`. A new `session:rename` case would go here (~line 851 area with other session handlers). Auto-suggest would need a new handler.
- `shared/types.ts` — `ClientMessage` union needs new variants (`session:rename`, possibly `session:suggest-title`). `ServerMessage` already has `session:title-updated`.

**For auto-suggest model calls:**
- `server/providers/claude/claude-agent-sdk-adapter.ts` — Uses `@anthropic-ai/claude-agent-sdk` `query()`. This is the Claude Code session interaction — sending a naming prompt through it would add to the conversation history.
- `@anthropic-ai/sdk` (v0.52.0) — Listed as a devDependency. This is the raw Anthropic API SDK. Could be used for a standalone model call that doesn't go through a session. [OPEN: whether it's wired up for direct use anywhere currently — needs verification.]
- `server/providers/codex/codex-acp-provider.ts` — Codex sessions go through ACP `sessionPrompt`. Same history-pollution concern.

## Things to Consider

- **History pollution is the core auto-suggest design question.** Sending "suggest a name for this session" through the session's `sendMessage` path would add it to the conversation history, which is wrong. Options:
  1. Use `@anthropic-ai/sdk` directly for a standalone API call with a summary of the conversation. Avoids session history entirely. Works for Claude sessions. Codex sessions would need a different path (OpenAI API?) or a CLI-agnostic approach.
  2. Use a separate ephemeral session just for the naming call. Heavier but uses existing infrastructure.
  3. Use a server-side utility that doesn't go through providers at all — just a direct API call with an API key. Simplest, but adds a new dependency path. [OPEN: discuss which approach makes sense.]
- **Manual rename is straightforward.** New `session:rename` client message → websocket handler calls `sessionManager.updateTitle()` → sends `session:title-updated` back. The client-side modal is the main work.
- **Modal UX specifics:** Text pre-selected on open, Enter to accept, Escape to cancel. If auto-suggest is triggered, the modal opens with the suggested name pre-filled instead of the current name. Same modal either way.
- **Where does the rename trigger live in the UI?** Options: right-click context menu on session item, a small edit icon that appears on hover, or in the archive button area. [OPEN: discuss during session.]
- **Naming prompt quality.** The prompt needs to produce good short names from potentially long conversations. May need to send just the first few messages or a summary rather than the full history. Prompt engineering territory — iterate during session.

## Confidence Notes

What's verified (read the code):
- `deriveTitle()` exists at session-manager.ts line 326, truncates first user message to 50 chars at word boundary — confirmed.
- `updateTitle()` exists at line 279, is public, sets title and persists — confirmed.
- Title derivation only runs when current title is "New Session" (line 228) — confirmed.
- `session:title-updated` server message type exists in shared/types.ts — confirmed.
- sidebar.js handles `session:title-updated` at line 234 — confirmed.
- websocket.ts sends `session:title-updated` after prompt completes (line 973-979) — confirmed.
- No `session:rename` or `session:suggest-title` message types exist anywhere — confirmed via grep.
- `@anthropic-ai/sdk` is in devDependencies (v0.52.0) — confirmed in package.json.

What needs verification in session:
- Whether `@anthropic-ai/sdk` is imported or used anywhere currently, or if it's only a devDependency for types/testing. (~60% confident it's not used at runtime — only saw `claude-agent-sdk` imported in the adapter.)
- Whether the Claude Agent SDK `query()` supports any option to send a message without adding to history (like a system-level query). (~30% confident it doesn't — the API seems session-oriented — but worth checking docs.)
- Whether ACP has any equivalent of a "don't add to history" flag for Codex sessions. (~20% confident — seems unlikely given ACP's design.)
- What `shell.css` and `sidebar.js` styling exists for hover states and action buttons on session items — relevant for deciding where to put the rename trigger. (Didn't check CSS in detail.)

## Session Style

This is an interactive pairing session. We'll discuss the auto-suggest approach, prototype the rename modal, and iterate together. The user has specific ideas about how the modal interaction should feel — bring implementation approaches and flag complexity tradeoffs.
