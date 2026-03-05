# Story 5: Tool Call Rendering — Pairing Session Prompt

## Project Context

**Liminal Builder** is an agentic IDE wrapping AI coding CLIs (Claude Code, Codex) in a browser chat interface. Agent turns frequently include tool calls — file reads, writes, bash commands, grep searches, etc. These are a core part of the agent workflow and appear inline in the chat alongside assistant text and thinking blocks.

**Architecture:** Bun + Fastify server, vanilla HTML/JS client. Tool calls arrive as `UpsertObject` with `type: "tool_call"` and progress through statuses: `create` → `complete` or `error`. Each carries `toolName`, `toolArguments`, `callId`, and optionally `toolOutput` on completion.

## Current Rendering (Verified)

**chat.js `renderToolCallEntry()`** (lines 144-190):
- **Running:** Creates a `<span class="tool-name">` with the tool name + a `<span class="tool-status-running"> Running...</span>`
- **Complete:** A `<details open=false>` with `<summary>` text `"toolName (done)"` and a `<pre>` block with raw `entry.result` as textContent
- **Error:** `<span class="tool-name">` + `<span class="tool-status-error"> Error: message</span>`
- On re-render (status change), the entire element is replaced via `existing.replaceWith(element)` (line 183)

**portlet.js `mapUpsertToEntry()`** (lines 258-319) transforms tool_call upserts:
- `name` field is built as: `toolName + formatToolArguments(upsert.toolArguments)` — where `formatToolArguments` (line 233) stringifies the full JSON and prepends it with a space. So the entry name becomes something like `Read {"file_path":"/foo/bar.ts","limit":50}` — the full argument JSON baked into the display name.
- `result` field carries `toolOutput` for complete status
- `error` field carries `errorMessage` for error status

**CSS** (portlet.css):
- `.chat-entry-tool-call`: uses `--chat-tool-bg`, `--chat-tool-border` tokens
- `.tool-status-running`: `--accent-yellow`
- `.tool-status-error`: `--accent-red`
- `.chat-entry details > summary`: cursor pointer, `--fg-secondary` color
- `.chat-entry pre`: styled with background, border, monospace font — shared with code blocks

## Key Files

- `client/portlet/chat.js` — `renderToolCallEntry()` (lines 144-190). The rendering logic being reworked.
- `client/portlet/portlet.js` — `mapUpsertToEntry()` (line 258) for tool_call mapping, `formatToolArguments()` (line 233) for argument stringification, `toToolStatus()` (line 223) for status normalization.
- `client/portlet/portlet.css` — `.chat-entry-tool-call`, `.tool-status-running`, `.tool-status-error`, shared `pre` and `details > summary` styles.
- `client/shared/theme.css` — `--chat-tool-bg`, `--chat-tool-border`, accent color tokens.
- `server/streaming/upsert-types.ts` — `ToolCallUpsert` definition: `type`, `status`, `toolName`, `toolArguments`, `callId`, `toolOutput?`, `toolOutputIsError?`, `errorCode?`, `errorMessage?`.
- `server/acp/acp-types.ts` — `AcpPermissionRequest` interface (line 104-109): `toolCallId`, `title`, `description?`.
- `server/acp/acp-client.ts` — `handleAgentRequest()` (line 422): permission handling. Currently auto-approves all `session/request_permission` requests with `{ approved: true }` (line 434). No UI delegation.

## What We're Working On

Making tool calls look good and work properly in the chat UI.

Areas to explore:
- **Visual treatment:** Tool call cards with clear name, status indicator, collapsible output. The Codex app shows clean collapsible tool sections as a reference.
- **Separate name from arguments:** Currently the full JSON arguments are baked into the display name string via `formatToolArguments()`. Should separate these — show tool name prominently, arguments as a secondary detail (collapsible or truncated).
- **Tool output rendering:** Many tool results contain code, file contents, or structured text. Raw `<pre>` with textContent doesn't do them justice. At minimum, consider syntax-highlighted code rendering within tool output (builds on Story 4's hljs work).
- **Large output handling:** Some tool outputs are large (full file contents from Read tool). Need scrollable, maybe truncated-with-expand treatment.
- **Permission requests:** See dedicated section below.

## Permission Request Handling

**Current state (verified):** The ACP client auto-approves all permission requests. In `acp-client.ts` line 430, `session/request_permission` is handled by immediately responding `{ approved: true }`. The comment says "params stored for future stories (fs/terminal delegation)."

**What exists in types:** `AcpPermissionRequest` has `toolCallId`, `title`, and optional `description`. This is the data the agent sends when asking for permission.

**What's missing:** No UI path. The permission request never reaches the browser — it's silently approved server-side. For the harness to properly handle permissions, it would need:
1. A way to forward the permission request to the client (new message type or extend tool_call upserts)
2. UI to show the request with approve/deny buttons
3. A way to send the user's decision back to the server → ACP client

[OPEN: This is potentially a significant feature, not just a rendering change. May be better scoped as its own story or deferred. The current auto-approve works for most cases — the error the user mentioned may be specific to certain tool types. Discuss scope in session.]

**Note:** This only applies to Codex/ACP sessions. Claude Code sessions go through the Agent SDK which handles permissions differently (the SDK manages its own permission model). [~70% confident on this — needs verification of how the Claude Agent SDK handles tool permissions.]

## Things to Consider

- Tool calls are high-frequency in coding sessions. A single turn can have 10+ tool calls. Rendering needs to be compact when collapsed and informative when expanded.
- The `formatToolArguments` approach of baking JSON into the name string should be reworked at the `mapUpsertToEntry` level, not just the rendering — pass arguments as structured data to the renderer.
- Some tool names are very descriptive on their own (Read, Write, Bash, Grep) — the arguments are the useful part. Other tools have less obvious names. The rendering should accommodate both.
- If Story 4 (markdown rendering) runs first, tool output rendering can use `renderMarkdown()` or at least the hljs pipeline for code content.

## Confidence Notes

What's verified (read the code):
- `renderToolCallEntry` structure (running/complete/error) — confirmed at chat.js lines 144-190.
- `formatToolArguments` stringifies full JSON into the name — confirmed at portlet.js line 233-246.
- Tool call element replacement on status change — confirmed at chat.js line 183.
- ACP auto-approves permissions at acp-client.ts line 430-436 — confirmed.
- `AcpPermissionRequest` type has `toolCallId`, `title`, `description?` — confirmed at acp-types.ts lines 105-109.
- `ToolCallUpsert` fields — confirmed in upsert-types.ts.

What needs verification in session:
- Whether the permission-related errors the user described are from the ACP auto-approve path or from something else entirely (maybe a tool type that crashes rather than requesting permission). (~50% confident — didn't see error paths related to permissions.)
- How the Claude Agent SDK handles tool permissions — whether it has its own request flow or handles them internally. (~70% confident it's internal but should verify.)
- Whether there are existing test cases in `codex-acp-provider.test.ts` that cover tool call rendering scenarios specifically. (Didn't read the test file.)

## Session Style

This is an interactive pairing session. We'll look at current rendering, discuss what good tool call UI looks like, prototype improvements, and iterate. The user will provide direction on visual design and interaction patterns.
