# Prompt 3.2: Green (Chat Session UI)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. The stack is Bun + Fastify server, vanilla HTML/JS client using a shell/portlet (iframe) model, with WebSocket bridging the browser to ACP agent processes (Claude Code, Codex) running over JSON-RPC/stdio.

Story 3 implements the chat interface inside the portlet iframe. In the prior Skeleton + Red phase, the portlet/chat/input modules were stubbed with the correct structure and 17 tests were written (all currently failing with NotImplementedError). In this Green phase, you will implement the full chat rendering pipeline, streaming response handling, markdown rendering, auto-scroll, tool call state transitions, thinking block styling, and cancel functionality -- making all 17 tests pass.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `client/portlet/portlet.js` -- has postMessage handler skeleton, all functions throw NotImplementedError
- `client/portlet/chat.js` -- has rendering function stubs, all throw NotImplementedError
- `client/portlet/input.js` -- has input function stubs, all throw NotImplementedError
- `client/shared/markdown.js` -- has marked + DOMPurify setup stub
- `tests/client/chat.test.ts` -- 9 tests, all failing
- `tests/client/input.test.ts` -- 5 tests, all failing
- `tests/client/portlet.test.ts` -- 3 tests, all failing
- All 27 prior tests pass

## Reference Documents

(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Flow 3: Chat Interaction, postMessage Protocol, Client Module Architecture)
- Feature Spec: `docs/feature-spec-mvp.md` (Flow 3: Chat Interaction ACs 3.1-3.7, AC-5.4, Message Reconciliation Rules)

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

### Message Reconciliation Rules

- **`session:history`** -- replaces the entire entry list (response to session:open)
- **`session:update`** -- upserts: if an entry with the same `entryId` exists, replace it; otherwise append. This is how tool calls transition from running to complete.
- **`session:chunk`** -- appends `content` to the existing entry's `content` field (streaming text). The entry must already exist (created by a prior `session:update`).
- **`session:complete`** -- marks the entry as finalized. No further chunks will arrive for this `entryId`. Triggers markdown rendering.
- **`session:cancelled`** -- marks the entry as finalized due to user cancellation. Treated like `session:complete`.

## Task

### Files to Modify

1. **`client/portlet/portlet.js`** -- Full implementation:

   **postMessage handler (`handleShellMessage`):**
   - Implement the message reconciliation logic exactly as specified:
     - `session:history`: Replace `entries` array, call `chat.renderAll(entries)`
     - `session:update`: Upsert by `entryId` -- find existing, replace if found, push if new. Call `chat.renderEntry(entry)`. When the entry is type `user`, this represents the user's sent message appearing in chat (TC-3.1a).
     - `session:chunk`: Find entry by `entryId`, append `msg.content` to `entry.content`, call `chat.updateEntryContent(entryId, entry.content)`
     - `session:complete`: Call `chat.finalizeEntry(entryId)`, call `input.enable()`, set `sessionState = 'idle'`
     - `session:cancelled`: Same as complete -- call `chat.finalizeEntry(entryId)`, call `input.enable()`, set `sessionState = 'idle'`
     - `agent:status`: Call `handleAgentStatus(status)`
     - `session:error`: Call `chat.showError(message)`

   **`handleAgentStatus(status)`:**
   - `'starting'`: Set `sessionState = 'launching'`, show launching indicator in `#agent-status` element (TC-5.4a)
   - `'connected'`: Clear launching indicator, set `sessionState = 'idle'`
   - `'disconnected'`: Show disconnected status, disable input
   - `'reconnecting'`: Show reconnecting status

   **`sendMessage(content)`:**
   - Post `{ type: 'session:send', content }` to `window.parent`
   - Set `sessionState = 'sending'`
   - Call `input.disable()` and `input.showCancel()`

   **`cancelResponse()`:**
   - Post `{ type: 'session:cancel' }` to `window.parent`

   **`getSessionState()`:** Return current `sessionState`

   **`getEntries()`:** Return current `entries` array

   **Security:** Verify `event.origin` matches expected origin in the postMessage listener.

2. **`client/portlet/chat.js`** -- Full implementation:

   **`init(container)`:**
   - Store reference to chat container element
   - Set up scroll event listener for auto-scroll detection
   - Set up scroll-to-bottom button click handler

   **`renderAll(entries)`:**
   - Clear the chat container
   - Render each entry by calling `renderEntry(entry)` for each
   - Scroll to bottom after all entries rendered

   **`renderEntry(entry)`:**
   - Create or find existing DOM element for this entry (by `data-entry-id` attribute)
   - Delegate to type-specific renderer based on `entry.type`:

   **User entry rendering:**
   - Create `div.chat-entry.chat-entry-user`
   - Render content as plain text (user messages are not markdown)
   - Include timestamp display

   **Assistant entry rendering:**
   - Create `div.chat-entry.chat-entry-assistant`
   - During streaming (before `finalizeEntry`): render content as raw text with a blinking cursor CSS class
   - After `finalizeEntry`: render content through the markdown pipeline (see markdown.js below)

   **Thinking entry rendering:**
   - Create `div.chat-entry.chat-entry-thinking`
   - Apply muted styling: CSS class `thinking-block` with reduced opacity, italic, smaller font
   - Make collapsible: wrap in a `<details>` element with `<summary>Thinking...</summary>`
   - Content rendered as plain text inside the details

   **Tool call entry rendering (state transitions):**
   - Create `div.chat-entry.chat-entry-tool-call`
   - **Running state** (`status: 'running'`): Display tool name + spinning indicator. Example: `<span class="tool-name">{name}</span> <span class="tool-status-running">Running...</span>`
   - **Complete state** (`status: 'complete'`): Display tool name + success indicator, collapsed by default. Wrap result in `<details><summary>{name} (done)</summary><pre>{result}</pre></details>`
   - **Error state** (`status: 'error'`): Display tool name + error indicator. Show error message visibly: `<span class="tool-name">{name}</span> <span class="tool-status-error">Error: {error}</span>`
   - Tool call upsert: When a `session:update` arrives for an existing tool call entry, replace the DOM element entirely (the status has changed)

   **`updateEntryContent(entryId, content)`:**
   - Find the DOM element by `data-entry-id`
   - Update the text content (raw text, no markdown during streaming)
   - Call auto-scroll check

   **`finalizeEntry(entryId)`:**
   - Find the entry in the `entries` array and the DOM element
   - If the entry is type `assistant`: run the full markdown pipeline on the content and replace innerHTML
   - Remove any blinking cursor indicator
   - Call auto-scroll check

   **Auto-scroll implementation (TC-3.6a, TC-3.6b, TC-3.6c):**

   ```javascript
   let userScrolledUp = false;

   // Scroll event listener (set up in init)
   chatContainer.addEventListener('scroll', () => {
     const atBottom = chatContainer.scrollHeight - chatContainer.scrollTop
                      <= chatContainer.clientHeight + 50; // 50px threshold
     userScrolledUp = !atBottom;
     scrollToBottomBtn.style.display = userScrolledUp ? 'block' : 'none';
   });

   // Called after content changes
   function autoScroll() {
     if (!userScrolledUp) {
       chatContainer.scrollTop = chatContainer.scrollHeight;
     }
   }

   // Scroll-to-bottom button click handler (set up in init)
   scrollToBottomBtn.addEventListener('click', () => {
     chatContainer.scrollTop = chatContainer.scrollHeight;
     userScrolledUp = false;
     scrollToBottomBtn.style.display = 'none';
   });
   ```

   **`showError(message)`:**
   - Append an error entry to the chat container with distinct error styling

3. **`client/portlet/input.js`** -- Full implementation:

   **`init(container, onSend, onCancel)`:**
   - Get references to `#message-input`, `#send-btn`, `#cancel-btn`, `#working-indicator`
   - Set up send button click handler: if input is not empty and not disabled, call `onSend(getValue())`; then `clear()`
   - Set up cancel button click handler: call `onCancel()`
   - Set up input validation: disable send button when input is empty (TC-3.1b)
   - Listen to `input` events on textarea to toggle send button disabled state

   **`enable()`:**
   - Enable textarea and send button
   - Hide working indicator
   - Hide cancel button

   **`disable()`:**
   - Disable textarea and send button
   - Show working indicator (TC-3.5b)

   **`showWorking()`:**
   - Show the `#working-indicator` element

   **`hideWorking()`:**
   - Hide the `#working-indicator` element

   **`showCancel()`:**
   - Show the `#cancel-btn` element (TC-3.7a)

   **`hideCancel()`:**
   - Hide the `#cancel-btn` element (TC-3.7c)

   **`getValue()`:**
   - Return the textarea value

   **`clear()`:**
   - Clear the textarea value
   - Disable send button (since input is now empty)

4. **`client/shared/markdown.js`** -- Full implementation:

   The markdown rendering pipeline converts raw markdown text to sanitized HTML with syntax highlighting.

   **Pipeline:**
   ```
   raw markdown string
     -> marked.parse(text, { gfm: true, breaks: true })
     -> DOMPurify.sanitize(html, { ... })
     -> return sanitized HTML string
   ```

   **Implementation:**

   ```javascript
   import { marked } from '/node_modules/marked/lib/marked.esm.js';

   // Keep the no-bundler browser contract from Story 0:
   // - marked loaded as ESM from /node_modules
   // - DOMPurify available on window (script tag/global)
   // - highlight.js optional; use if present on window

   marked.setOptions({ gfm: true, breaks: true });

   export function renderMarkdown(text) {
     const html = marked.parse(text ?? '');
     if (typeof window !== 'undefined' && window.DOMPurify) {
       return window.DOMPurify.sanitize(html, {
         USE_PROFILES: { html: true },
         ADD_TAGS: ['pre', 'code', 'span'],
         ADD_ATTR: ['class'],
       });
     }
     return html;
   }
   ```

   Keep the module browser-compatible without a bundler. Do not rely on bare-package imports like `import ... from 'dompurify'` in client runtime code unless the existing project setup already resolves them.

### Files NOT to Modify

- No server files
- Prefer not to modify tests. If a Red test has a clear invalid assumption, make the smallest correction that preserves TC intent and document it.
- No shell files (shell.js, sidebar.js, tabs.js)
- No HTML files (the HTML structure from Story 0 should be sufficient)

## Constraints

- Do NOT implement beyond this story's scope (no session management, no tab management)
- Do NOT modify any server files
- Prefer not to modify tests; if required for correctness, apply minimal TC-preserving fixes and document why.
- Do NOT modify files outside the specified list
- Use exact type names and field names from the inlined definitions
- All postMessage handlers must verify `event.origin`
- Deferred markdown rendering: raw text during streaming, `marked` + `DOMPurify` on `session:complete` only
- Auto-scroll threshold: 50px from bottom
- Tool call entries use upsert (replace DOM element on status change)
- Thinking blocks must use the CSS class `thinking-block` and be wrapped in `<details>`

## If Blocked or Uncertain

- Resolve normal inconsistencies using feature spec + tech design and continue.
- If test expectations conflict with contracts, make the minimal correction that preserves TC intent and document it.
- Ask only when blocked by missing local context.

## Verification

Run the following commands:

```bash
# Typecheck should pass
bun run typecheck

# ALL tests should pass (27 prior + 17 new = 44 total)
bun test

# Or run specifically:
bun test tests/client/chat.test.ts tests/client/input.test.ts tests/client/portlet.test.ts
```

**Expected outcome:**
- `bun run typecheck`: 0 errors
- `bun test`: 44 tests pass, 0 fail

## Done When

- [ ] `client/portlet/portlet.js` fully implements postMessage handling and message reconciliation
- [ ] `client/portlet/chat.js` fully implements entry rendering, streaming, auto-scroll, tool call states, thinking blocks
- [ ] `client/portlet/input.js` fully implements input bar with send/cancel/disable/working
- [ ] `client/shared/markdown.js` fully implements marked + DOMPurify + highlight.js pipeline
- [ ] All 9 chat tests pass (TC-3.2a, TC-3.2b, TC-3.3a-c, TC-3.4a, TC-3.6a-c)
- [ ] All 5 input tests pass (TC-3.1b, TC-3.5a, TC-3.5b, TC-3.7a, TC-3.7c)
- [ ] All 3 portlet tests pass (TC-3.1a, TC-5.4a, TC-3.7b)
- [ ] All 27 prior tests still pass
- [ ] `bun run typecheck` passes
- [ ] No server files modified
- [ ] No test files modified
