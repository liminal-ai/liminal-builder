# Prompt 4.2: Green (Session Management)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. The stack is Bun + Fastify server, vanilla HTML/JS client using a shell/portlet (iframe) model, with WebSocket bridging the browser to ACP agent processes (Claude Code, Codex) running over JSON-RPC/stdio.

Story 4 implements session CRUD, listing, persistence, and archive. In the prior Skeleton + Red phase, the SessionManager was stubbed and 13 tests were written (all failing with NotImplementedError). In this Green phase, you will implement the full SessionManager (canonical ID management, session list assembly, title derivation, archive, session open sequence), wire the WebSocket handlers, and implement session rendering in the sidebar -- making all 13 tests pass.

**Important architecture note:** SessionManager must resolve project working directories through ProjectStore for both `createSession` and `openSession`. Avoid pushing `projectPath` resolution into WebSocket handlers.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `server/sessions/session-manager.ts` -- SessionManager stub with `toCanonical`/`fromCanonical` implemented, all other methods throw NotImplementedError
- `server/sessions/session-types.ts` -- SessionMeta, SessionListItem, CliType types
- `server/store/json-store.ts` -- JsonStore fully implemented
- `server/acp/agent-manager.ts` -- AgentManager implemented (Story 2b)
- `server/acp/acp-client.ts` -- AcpClient implemented (Story 2a)
- `server/websocket.ts` -- WebSocket handler with project and agent routing
- `client/shell/sidebar.js` -- Sidebar with project list, session stubs
- `tests/server/session-manager.test.ts` -- 10 tests, all failing
- `tests/client/sidebar.test.ts` -- 7 tests total (4 passing from Story 1, 3 failing new)
- All 45 prior tests pass

## Reference Documents

(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Flow 2: Session Browsing & Creation, SessionManager interface)
- Feature Spec: `docs/feature-spec-mvp.md` (Flow 2: Session Browsing & Creation ACs 2.1-2.5)

## Inlined Type Definitions

### SessionMeta

```typescript
export interface SessionMeta {
  id: string;              // Canonical ID: "{cliType}:{acpSessionId}"
  projectId: string;       // Parent project ID
  cliType: CliType;        // Which CLI type owns this session
  archived: boolean;       // Hidden from sidebar when true
  title: string;           // Derived from first user message; "New Session" initially
  lastActiveAt: string;    // ISO 8601 UTC -- updated on message send/receive
  createdAt: string;       // ISO 8601 UTC -- set on session creation
}
```

### SessionListItem

```typescript
export interface SessionListItem {
  id: string;
  title: string;
  lastActiveAt: string;
  cliType: CliType;
}
```

### CliType

```typescript
export type CliType = 'claude-code' | 'codex';
```

### ProjectStore Interface (used by SessionManager)

```typescript
interface ProjectStore {
  listProjects(): Promise<Array<{ id: string; path: string; name: string; addedAt: string }>>;
}
```

### ChatEntry (discriminated union)

```typescript
type ChatEntry =
  | { entryId: string; type: 'user'; content: string; timestamp: string }
  | { entryId: string; type: 'assistant'; content: string; timestamp: string }
  | { entryId: string; type: 'thinking'; content: string }
  | { entryId: string; type: 'tool-call'; toolCallId: string; name: string;
      status: 'running' | 'complete' | 'error'; result?: string; error?: string }
```

### Canonical ID Helpers (already implemented)

```typescript
static toCanonical(cliType: CliType, acpId: string): string {
  return `${cliType}:${acpId}`;
}

static fromCanonical(canonicalId: string): { cliType: CliType; acpId: string } {
  const colonIdx = canonicalId.indexOf(':');
  return {
    cliType: canonicalId.substring(0, colonIdx) as CliType,
    acpId: canonicalId.substring(colonIdx + 1)
  };
}
```

### WebSocket Messages (session-related)

**Client to Server:**
```typescript
| { type: 'session:list'; projectId: string }
| { type: 'session:create'; projectId: string; cliType: 'claude-code' | 'codex' }
| { type: 'session:open'; sessionId: string }
| { type: 'session:send'; sessionId: string; content: string }
| { type: 'session:cancel'; sessionId: string }
| { type: 'session:archive'; sessionId: string }
```

**Server to Client:**
```typescript
| { type: 'session:list'; projectId: string; sessions: SessionListItem[] }
| { type: 'session:created'; sessionId: string; projectId: string; requestId?: string }
| { type: 'session:history'; sessionId: string; entries: ChatEntry[]; requestId?: string }
| { type: 'session:archived'; sessionId: string; requestId?: string }
| { type: 'session:title-updated'; sessionId: string; title: string }
| { type: 'error'; requestId?: string; message: string }
```

## Task

### Files to Modify

1. **`server/sessions/session-manager.ts`** -- Full implementation:

   **Constructor:**
   - Accept `JsonStore<SessionMeta[]>`, `AgentManager`, and `ProjectStore`
   - Load sessions from store on initialization (read from JSON file)
   - Store as private `sessions: SessionMeta[]` array

   **`createSession(projectId, cliType)`:**
   ```
   1. Resolve project path from ProjectStore using projectId
      - If project not found, throw error
   2. Get AcpClient via agentManager.ensureAgent(cliType)
   3. Call acpClient.sessionNew({ cwd: projectPath })
   4. Receive { sessionId: acpId } from ACP
   5. Build canonical ID: toCanonical(cliType, acpId)
   6. Create SessionMeta:
      - id: canonical ID
      - projectId: provided
      - cliType: provided
      - archived: false
      - title: "New Session"
      - lastActiveAt: new Date().toISOString()
      - createdAt: new Date().toISOString()
   7. Push to sessions array
   8. Persist to store
   9. Return canonical ID
   ```

   **`openSession(canonicalId)`:**
   ```
   1. Look up SessionMeta by canonical ID
   2. If not found, throw error "Session not found"
   3. Extract { cliType, acpId } via fromCanonical(canonicalId)
   4. Get AcpClient via agentManager.ensureAgent(cliType)
   5. Resolve project path via projectStore using `session.projectId`
      - If project not found, throw error
   6. Call acpClient.sessionLoad(acpId, cwd)
      - The sessionLoad method collects replayed history as ChatEntry[]
   7. Return the ChatEntry[] array
   8. Do NOT update lastActiveAt (only message send/receive updates it)
   ```

   **`listSessions(projectId)`:**
   ```
   1. Filter sessions where session.projectId === projectId
   2. Filter out archived sessions (session.archived !== true)
   3. Sort by lastActiveAt descending (most recent first)
   4. Map to SessionListItem[]:
      { id: session.id, title: session.title, lastActiveAt: session.lastActiveAt, cliType: session.cliType }
   5. Return the array
   ```

   This is entirely local -- no ACP calls needed. Fast and works even when agents are down.

   **`archiveSession(canonicalId)`:**
   ```
   1. Find session by canonical ID
   2. Set session.archived = true
   3. Persist to store
   ```

   **`sendMessage(canonicalId, content, onEvent)`:**
   ```
   1. Look up SessionMeta by canonical ID
   2. Extract { cliType, acpId } via fromCanonical(canonicalId)
   3. Title derivation check: if session.title === "New Session":
      a. Derive title from content: truncate to ~50 chars, trim whitespace
         - If content.length > 50, truncate at last word boundary before 50 chars, append "..."
         - If content.length <= 50, use content as-is
      b. Update session.title
      c. Persist to store
      d. Return the new title (caller emits session:title-updated)
   4. Update session.lastActiveAt = new Date().toISOString()
   5. Persist to store
   6. Get AcpClient via agentManager.ensureAgent(cliType)
   7. Call acpClient.sessionPrompt(acpId, content, onEvent)
   8. On prompt completion: update session.lastActiveAt again, persist
   9. Return AcpPromptResult
   ```

   **Title derivation logic (detail):**
   ```typescript
   function deriveTitle(content: string): string {
     const maxLen = 50;
     const trimmed = content.trim();
     if (trimmed.length <= maxLen) return trimmed;
     // Truncate at last space before maxLen
     const truncated = trimmed.substring(0, maxLen);
     const lastSpace = truncated.lastIndexOf(' ');
     if (lastSpace > 20) {
       return truncated.substring(0, lastSpace) + '...';
     }
     return truncated + '...';
   }
   ```

   **`updateTitle(canonicalId, title)`:**
   ```
   1. Find session by canonical ID
   2. Set session.title = title
   3. Persist to store
   ```

2. **`server/websocket.ts`** -- Add session message handlers:

   Wire the following message types to the SessionManager:

   **`session:list`:**
   ```
   1. Extract projectId from message
   2. Call sessionManager.listSessions(projectId)
   3. Send response: { type: 'session:list', projectId, sessions }
   ```

   **`session:create`:**
   ```
   1. Extract projectId, cliType from message
   2. Call sessionManager.createSession(projectId, cliType)
   4. Send response: { type: 'session:created', sessionId, projectId, requestId }
   5. On error: send { type: 'error', requestId, message }
   ```

   **`session:open`:**
   ```
   1. Extract sessionId from message
   2. Call sessionManager.openSession(sessionId)
   3. Send response: { type: 'session:history', sessionId, entries, requestId }
   4. On error: send { type: 'error', requestId, message: "Could not load session" }
   ```

   **`session:archive`:**
   ```
   1. Extract sessionId from message
   2. Call sessionManager.archiveSession(sessionId)
   3. Send response: { type: 'session:archived', sessionId, requestId }
   ```

   **Title update emission (in session:send handler):**
   ```
   When sendMessage detects a title change (title was "New Session" and is now derived),
   the websocket handler should emit:
   { type: 'session:title-updated', sessionId, title }
   ```

   Note: The `session:send` and `session:cancel` handlers may already be partially wired from Story 2b. Extend them to include the title derivation check.

3. **`client/shell/sidebar.js`** -- Full session rendering implementation:

   **`renderSessions(projectId, sessions)`:**
   - Clear the session list area under the project
   - For each session in the `sessions` array:
     - Create a session item element with:
       - Session title text
       - Relative timestamp (e.g., "2m", "1h", "2d", "1w" -- compute from `lastActiveAt`)
       - CLI type indicator (icon or badge: "CC" for claude-code, "CX" for codex)
       - Click handler: sends `session:open { sessionId }` via WebSocket (if not already tabbed, opens tab)
       - Archive button/action: sends `session:archive { sessionId }` via WebSocket
   - If sessions array is empty, show empty state: "No sessions. Create one to get started."

   **`showCliPicker(projectId)`:**
   - Show a simple picker UI with two options: "Claude Code" and "Codex"
   - Each option click handler: sends `session:create { projectId, cliType }` via WebSocket, hides picker
   - Cancel/dismiss handler: hides picker without sending any message (TC-2.2c)

   **`hideCliPicker()`:**
   - Hide the CLI picker UI

   **"New Session" button:**
   - Each expanded project in the sidebar should have a "New Session" button
   - Click handler: calls `showCliPicker(projectId)`

   **Archive action:**
   - When `session:archived` is received via WebSocket: remove the session from the sidebar list
   - Always call `closeTab(tabId)` for any associated tab (this is a no-op stub in Story 4; Story 5 implements full tab behavior)

   **`session:title-updated` event (server -> client):**
   - Emit from server when the first user message derives a non-default title
   - Client receives it and updates the session title in the sidebar list (shell.js routes to sidebar.js)

   **Relative timestamp helper:**
   ```javascript
   function relativeTime(isoString) {
     const diff = Date.now() - new Date(isoString).getTime();
     const minutes = Math.floor(diff / 60000);
     if (minutes < 1) return 'now';
     if (minutes < 60) return `${minutes}m`;
     const hours = Math.floor(minutes / 60);
     if (hours < 24) return `${hours}h`;
     const days = Math.floor(hours / 24);
     if (days < 7) return `${days}d`;
     const weeks = Math.floor(days / 7);
     return `${weeks}w`;
   }
   ```

### Files NOT to Modify

- Do NOT modify tests in Green. Red tests are the contract and must remain unchanged.
- No portlet files (portlet.js, chat.js, input.js -- Story 3's work)
- No ACP client or agent manager files (Stories 2a/2b's work)

## Constraints

- Do NOT implement beyond this story's scope (no tab management logic)
- Do NOT modify files outside the specified list
- Before implementation starts, run `bun run guard:test-baseline-record`.
- Use exact type names and field names from the inlined definitions
- Session listing is ENTIRELY LOCAL -- never call ACP for listing
- Canonical ID format is strictly `{cliType}:{acpSessionId}`
- Title derivation fires exactly once per session (on first `session:send` when title is "New Session")
- `lastActiveAt` updates on send AND on prompt completion, NOT on session open
- Archive is local-only (sets `archived: true`, no ACP call)
- Orphan sessions (created outside the app) never appear because listing is local-only

## If Blocked or Uncertain

- If you encounter inconsistencies between the inlined specs and existing code, choose the smallest assumption consistent with tech design and continue.
- If test expectations and implementation differ, align to tests first, then reconcile with feature/tech docs in notes.
- Ask only when there is a true hard blocker that cannot be resolved with local context.

## Verification

Run the following commands:

```bash
# Before implementation starts, record the test-change baseline
bun run guard:test-baseline-record

# Typecheck should pass
bun run typecheck

# ALL tests should pass (prior + 13 new Story 4 tests)
bun run test && bun run test:client

# Green quality gate (verify + fail if new test-file changes appear after baseline)
bun run green-verify
```

**Expected outcome:**
- `bun run typecheck`: 0 errors
- All server and client tests pass, 0 fail

## Done When

- [ ] `server/sessions/session-manager.ts` fully implements all methods
- [ ] `server/websocket.ts` handles session:list, session:create, session:open, session:archive, and emits `session:title-updated` (server -> client)
- [ ] `client/shell/sidebar.js` renders session lists, CLI picker, archive action
- [ ] All 10 session-manager tests pass
- [ ] All 7 sidebar tests pass (4 prior + 3 new)
- [ ] All 45 prior tests still pass
- [ ] `bun run green-verify` passes
- [ ] `bun run typecheck` passes
- [ ] No new test-file changes beyond the recorded baseline
- [ ] No files outside the specified list modified
