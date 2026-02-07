# Prompt 3.1: Skeleton + Red (Chat Session UI)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. The stack is Bun + Fastify server, vanilla HTML/JS client using a shell/portlet (iframe) model, with WebSocket bridging the browser to ACP agent processes (Claude Code, Codex) running over JSON-RPC/stdio.

Story 3 implements the chat interface inside the portlet iframe. This is the core user experience: sending messages and receiving streaming responses. The portlet runs inside an iframe and communicates with the shell (parent window) via `postMessage`. It renders four types of chat entries (user, assistant, thinking, tool-call), handles streaming text with deferred markdown rendering, manages auto-scroll behavior, and provides cancel functionality.

In this Skeleton + Red phase, you will update the existing portlet/chat/input stubs with the correct module structure and postMessage handler skeleton, then write 17 tests across 3 test files that exercise the intended behavior. New Story 3 tests should fail meaningfully against current stubs.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `server/errors.ts` -- has `NotImplementedError`, `AppError`
- `client/portlet/index.html` -- portlet page with chat container, input bar
- `client/portlet/portlet.js` -- postMessage handler stub
- `client/portlet/chat.js` -- chat render stub
- `client/portlet/input.js` -- input bar stub
- `client/portlet/portlet.css` -- chat + input styles
- `client/shared/markdown.js` -- marked + DOMPurify setup stub
- `client/shared/constants.js` -- CLI types, status values
- `shared/types.ts` -- ChatEntry, ClientMessage, ServerMessage types
- `tests/fixtures/sessions.ts` -- mock session data
- All 28 prior tests pass

## Reference Documents

(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (postMessage Protocol, Flow 3: Chat Interaction, Client Module Architecture)
- Feature Spec: `docs/feature-spec-mvp.md` (Flow 3: Chat Interaction ACs 3.1-3.7, AC-5.4)

## Inlined Type Definitions

### ChatEntry (discriminated union)

```typescript
type ChatEntry =
  | { entryId: string; type: 'user'; content: string; timestamp: string }
  | { entryId: string; type: 'assistant'; content: string; timestamp: string }
  | { entryId: string; type: 'thinking'; content: string }
  | { entryId: string; type: 'tool-call'; toolCallId: string; name: string;
      status: 'running' | 'complete' | 'error'; result?: string; error?: string }
```

### postMessage Protocol

**Shell to Portlet (ShellToPortlet):**

```typescript
type ShellToPortlet =
  | { type: 'session:history'; entries: ChatEntry[] }
  | { type: 'session:update'; entry: ChatEntry }
  | { type: 'session:chunk'; entryId: string; content: string }
  | { type: 'session:complete'; entryId: string }
  | { type: 'session:cancelled'; entryId: string }
  | { type: 'agent:status'; status: 'starting' | 'connected' | 'disconnected' | 'reconnecting' }
  | { type: 'session:error'; message: string }
```

**Portlet to Shell (PortletToShell):**

```typescript
type PortletToShell =
  | { type: 'session:send'; content: string }
  | { type: 'session:cancel' }
  | { type: 'portlet:ready' }
  | { type: 'portlet:title'; title: string }
```

### postMessage to WebSocket Contract Mapping (Canonical)

WebSocket contracts are canonical and require fields that are not always present in iframe `postMessage` payloads. The iframe sends minimal UI events; the parent shell enriches those events before forwarding to `server/websocket.ts`.

```typescript
// Canonical WebSocket client -> server
type WsClientMessage =
  | { type: 'session:send'; sessionId: string; content: string }
  | { type: 'session:cancel'; sessionId: string };

// Canonical WebSocket server -> client (subset relevant to Story 3)
type WsServerMessage =
  | { type: 'session:cancelled'; sessionId: string; entryId: string }
  | { type: 'agent:status'; cliType: string; status: 'starting' | 'connected' | 'disconnected' | 'reconnecting' };
```

Required translation rules:

| Direction | Incoming Payload | Outgoing Payload | Rule |
|-----------|------------------|------------------|------|
| Portlet -> Shell -> WS | `{ type: 'session:send', content }` | `{ type: 'session:send', sessionId, content, requestId? }` | Shell must inject `sessionId` from active session context. Shell may inject `requestId` for response correlation. |
| Portlet -> Shell -> WS | `{ type: 'session:cancel' }` | `{ type: 'session:cancel', sessionId }` | Shell must inject `sessionId` from active session context. |
| WS -> Shell -> Portlet | `{ type: 'session:cancelled', sessionId, entryId }` | `{ type: 'session:cancelled', entryId }` | Shell routes by `sessionId` and forwards to the matching iframe. |
| WS -> Shell -> Portlet | `{ type: 'agent:status', cliType, status }` | `{ type: 'agent:status', status }` | Shell preserves `cliType` for routing/logging and forwards UI-relevant status to portlet. |
| WS -> Shell -> Portlet | `{ type: 'error', requestId?, message }` | `{ type: 'session:error', message }` | Shell routes errors by `requestId` correlation or broadcasts to active portlet. |

`sessionId` is never sourced from the iframe in Story 3. Parent-shell enrichment is mandatory before any WS send.

### Message Reconciliation Rules

The portlet maintains a list of `ChatEntry` objects per session, keyed by `entryId`:

- **`session:history`** -- replaces the entire entry list (response to session:open)
- **`session:update`** -- upserts: if an entry with the same `entryId` exists, replace it; otherwise append. This is how tool calls transition from running to complete.
- **`session:chunk`** -- appends `content` to the existing entry's `content` field (streaming text). The entry must already exist (created by a prior `session:update`).
- **`session:complete`** -- marks the entry as finalized. No further chunks will arrive for this `entryId`. Triggers markdown rendering.
- **`session:cancelled`** -- marks the entry as finalized due to user cancellation. Treated like `session:complete`.

### Message Reconciliation Pseudocode (portlet.js)

```javascript
function handleShellMessage(msg) {
  switch (msg.type) {
    case 'session:history':
      // Replace entire entry list (on session open)
      entries = msg.entries;
      chat.renderAll(entries);
      break;

    case 'session:update':
      // Upsert: replace if exists, append if new
      const idx = entries.findIndex(e => e.entryId === msg.entry.entryId);
      if (idx >= 0) entries[idx] = msg.entry;
      else entries.push(msg.entry);
      chat.renderEntry(msg.entry);
      break;

    case 'session:chunk':
      // Append content to existing entry (streaming text)
      const entry = entries.find(e => e.entryId === msg.entryId);
      if (entry) {
        entry.content += msg.content;
        chat.updateEntryContent(msg.entryId, entry.content);
      }
      break;

    case 'session:complete':
      // Mark entry as finalized — trigger markdown rendering
      chat.finalizeEntry(msg.entryId);
      input.enable();  // Re-enable send
      break;

    case 'session:cancelled':
      // Treat like complete — finalize entry, re-enable input
      chat.finalizeEntry(msg.entryId);
      input.enable();
      break;

    case 'agent:status':
      // Handle agent lifecycle status changes
      handleAgentStatus(msg.status);
      break;

    case 'session:error':
      // Display error in chat area
      chat.showError(msg.message);
      break;
  }
}
```

### Auto-scroll Pseudocode (chat.js)

```javascript
let userScrolledUp = false;

chatContainer.addEventListener('scroll', () => {
  const atBottom = chatContainer.scrollHeight - chatContainer.scrollTop
                   <= chatContainer.clientHeight + 50; // 50px threshold
  userScrolledUp = !atBottom;
  scrollToBottomBtn.style.display = userScrolledUp ? 'block' : 'none';
});

function appendContent() {
  // ... render content ...
  if (!userScrolledUp) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

scrollToBottomBtn.addEventListener('click', () => {
  chatContainer.scrollTop = chatContainer.scrollHeight;
  userScrolledUp = false;
  scrollToBottomBtn.style.display = 'none';
});
```

## Task

### Files to Modify

1. **`client/portlet/portlet.js`** -- Update the existing stub to include:
   - The postMessage event listener skeleton with `handleShellMessage()` dispatcher
   - An `entries` array to hold `ChatEntry[]` state
   - A `sessionState` variable tracking `'idle' | 'sending' | 'launching'`
   - Functions: `handleShellMessage(msg)`, `handleAgentStatus(status)`, `sendMessage(content)`, `cancelResponse()`
   - Each function body should throw `new Error('NotImplementedError')` (since this is client JS, not TS, use `Error` with the message 'NotImplementedError')
   - Design intent (implemented in Green, not Red): `sendMessage` posts `{ type: 'session:send', content }` to parent (parent later enriches with `sessionId` before WS send)
   - Design intent (implemented in Green, not Red): `cancelResponse` posts `{ type: 'session:cancel' }` to parent (parent later enriches with `sessionId` before WS send)
   - Export or expose: `handleShellMessage`, `sendMessage`, `cancelResponse`, `getSessionState`, `getEntries`

2. **`client/portlet/chat.js`** -- Update the existing stub to include:
   - Functions: `renderAll(entries)`, `renderEntry(entry)`, `updateEntryContent(entryId, content)`, `finalizeEntry(entryId)`, `showError(message)`, `init(container)`
   - Auto-scroll state variable `userScrolledUp`
   - A `scrollToBottomBtn` reference
   - Each function body should throw `new Error('NotImplementedError')`
   - Export or expose all functions

3. **`client/portlet/input.js`** -- Update the existing stub to include:
   - Functions: `init(container, onSend, onCancel)`, `enable()`, `disable()`, `showWorking()`, `hideWorking()`, `showCancel()`, `hideCancel()`, `getValue()`, `clear()`
   - Each function body should throw `new Error('NotImplementedError')`
   - Export or expose all functions

### Test Files to Create

4. **`tests/client/chat.test.ts`** -- 9 tests using jsdom:

   ```
   TC-3.2a: streaming renders incrementally -- send multiple session:chunk messages, assert content grows with each chunk
   TC-3.2b: markdown rendered on complete -- send session:complete with markdown content, assert HTML has formatted elements (e.g., <h1>, <code>)
   TC-3.3a: tool call shows name and running indicator -- send session:update with tool-call entry (status: running), assert name and spinner/running indicator visible
   TC-3.3b: tool call shows result collapsed on completion -- send session:update with tool-call entry (status: complete), assert collapsed with success indicator
   TC-3.3c: tool call shows error on failure -- send session:update with tool-call entry (status: error), assert error message visible
   TC-3.4a: thinking blocks have distinct styling -- send session:update with thinking entry, assert muted/collapsible CSS class present
   TC-3.6a: auto-scroll during response -- append content, assert scrollTop equals scrollHeight (scrolled to bottom)
   TC-3.6b: auto-scroll pauses on user scroll up -- scroll up, then append content, assert scrollTop unchanged and scroll-to-bottom button visible
   TC-3.6c: scroll-to-bottom resumes auto-scroll -- click scroll-to-bottom button, assert scrolled to bottom and button hidden
   ```

5. **`tests/client/input.test.ts`** -- 5 tests using jsdom:

   ```
   TC-3.1b: empty message cannot be sent -- render input with empty value, assert send button is disabled
   TC-3.5a: input bar visible and functional -- render portlet, assert input textarea and send button are present in DOM
   TC-3.5b: input disabled during agent response -- set sending state, assert send button disabled and working indicator shown
   TC-3.7a: cancel action visible during response -- set sending state, assert cancel button visible
   TC-3.7c: cancel not visible when idle -- default state (not sending), assert cancel button not visible/hidden
   ```

6. **`tests/client/portlet.test.ts`** -- 3 tests using jsdom:

   ```
   TC-3.1a: sent message appears immediately -- simulate sending a message via portlet, assert user entry rendered in DOM before any `session:update` round-trip
   TC-5.4a: launching indicator shown on agent starting -- send agent:status { status: 'starting' } via postMessage, assert loading/launching indicator shown
   TC-3.7b: cancel stops response and re-enables input -- simulate streaming state, send session:cancelled, assert partial content visible and input re-enabled
   ```

   Note: `session:history` reconciliation is implemented in Story 3 portlet logic but not directly tested in Story 3 Red; it is covered by Story 4 session-open testing.

### Test Structure Guidance

Each test file should:
- Use the Vitest import convention: `import { describe, it, expect, vi } from 'vitest'` (use `it` not `test`, include `vi` for mocking)
- Import `jsdom` (or use Bun's happy-dom/jsdom environment)
- Set up a minimal DOM with the required HTML structure before each test
- Import the module under test
- Use `describe` and `it` blocks with TC IDs in the test name
- Tests should currently fail against stubbed behavior, while preserving clear assertions for Green.

**Chat container HTML structure expected by chat.js:**

```html
<div id="chat-container">
  <!-- entries rendered here -->
</div>
<button id="scroll-to-bottom" style="display: none;">Scroll to bottom</button>
```

**Input bar HTML structure expected by input.js:**

```html
<div id="input-bar">
  <textarea id="message-input" placeholder="Send a message..."></textarea>
  <button id="send-btn">Send</button>
  <button id="cancel-btn" style="display: none;">Cancel</button>
  <div id="working-indicator" style="display: none;">Working...</div>
</div>
```

**Portlet HTML structure (portlet.js coordinates chat + input):**

```html
<div id="portlet-root">
  <div id="agent-status"></div>
  <div id="chat-container"></div>
  <button id="scroll-to-bottom" style="display: none;">Scroll to bottom</button>
  <div id="input-bar">
    <textarea id="message-input"></textarea>
    <button id="send-btn">Send</button>
    <button id="cancel-btn" style="display: none;">Cancel</button>
    <div id="working-indicator" style="display: none;">Working...</div>
  </div>
</div>
```

## Constraints

- Do NOT implement the actual rendering logic, markdown pipeline, or auto-scroll behavior yet -- stubs only
- Do NOT modify any server files
- Do NOT modify files outside the specified list
- Use exact type names and field names from the inlined definitions above
- All functions in the client stubs should throw `new Error('NotImplementedError')`
- Tests must reference TC IDs in their test names (e.g., `it('TC-3.2a: streaming renders incrementally', ...)`)
- Keep the existing exports/API surface of the stubs -- only add, do not remove

## If Blocked or Uncertain

- Resolve straightforward mismatches using feature spec + tech design as source of truth and continue.
- Ask only for true blockers that cannot be resolved from local context.

## Verification

Run the following commands:

```bash
# Full quality gate (format, lint, eslint, typecheck, test)
bun run verify
```

**Expected:** Passes — new test files and stub updates should not introduce lint, format, or type errors.

```bash
# Typecheck should pass
bun run typecheck

# Prior story tests should still pass
bun run test
bunx vitest run tests/client/sidebar.test.ts --passWithNoTests

# New tests should exist and fail against current stubs
bunx vitest run tests/client/chat.test.ts tests/client/input.test.ts tests/client/portlet.test.ts --passWithNoTests
```

**Expected outcome:**
- `bun run typecheck`: 0 errors
- Prior tests: 28 pass, 0 fail
- New tests: failing outcomes attributable to unimplemented Story 3 behavior

## Done When

- [ ] `client/portlet/portlet.js` has postMessage handler skeleton with all functions stubbed
- [ ] `client/portlet/chat.js` has all rendering function stubs
- [ ] `client/portlet/input.js` has all input function stubs
- [ ] `tests/client/chat.test.ts` exists with 9 tests, initially failing against Story 3 stubs
- [ ] `tests/client/input.test.ts` exists with 5 tests, initially failing against Story 3 stubs
- [ ] `tests/client/portlet.test.ts` exists with 3 tests, initially failing against Story 3 stubs
- [ ] All 28 prior tests still pass
- [ ] `bun run typecheck` passes
- [ ] No server files modified
