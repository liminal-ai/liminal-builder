# Prompt 4.1: Skeleton + Red (Session Management)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. The stack is Bun + Fastify server, vanilla HTML/JS client using a shell/portlet (iframe) model, with WebSocket bridging the browser to ACP agent processes (Claude Code, Codex) running over JSON-RPC/stdio.

Story 4 implements session CRUD, listing, persistence, and archive. Sessions are the core content unit -- each represents a conversation with an AI agent in the context of a project directory. The critical architectural insight is that ACP has no `session/list` method, so session listing is entirely local. Liminal Builder owns all session metadata (IDs, titles, timestamps, project mappings, archived state), while ACP agents own only conversation content (accessed via `session/load` replay).

In this Skeleton + Red phase, you will update the existing `SessionManager` stub with the correct method signatures and internal structure (still throwing NotImplementedError), add session-related handlers to the sidebar, and write 13 failing tests across 2 test files.

**Important architecture note:** SessionManager must resolve project working directories through ProjectStore. This removes hidden dependencies where `openSession` needs `cwd` but no dependency provides it.

**Source-of-truth override:** Use the canonical SessionManager contract (`constructor(store, agentManager, projectStore)`, `createSession(projectId, cliType)`). Session listing is local-only (no ACP join), titles derive from the first user message, and tests run with Vitest (not `bun:test`).

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `server/sessions/session-manager.ts` -- SessionManager class stub (methods throw NotImplementedError)
- `server/sessions/session-types.ts` -- SessionMeta, SessionListItem, CliType types
- `server/store/json-store.ts` -- JsonStore fully implemented
- `server/acp/agent-manager.ts` -- AgentManager implemented (Story 2b)
- `server/acp/acp-client.ts` -- AcpClient implemented (Story 2a)
- `server/websocket.ts` -- WebSocket handler with project and agent message routing
- `client/shell/sidebar.js` -- Sidebar with project list, collapse/expand
- `shared/types.ts` -- ChatEntry, ClientMessage, ServerMessage types
- `tests/fixtures/sessions.ts` -- Mock session data
- All 45 prior tests pass

## Reference Documents

(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Flow 2: Session Browsing & Creation, SessionManager interface, session-types)
- Feature Spec: `docs/feature-spec-mvp.md` (Flow 2: Session Browsing & Creation ACs 2.1-2.5, SessionMeta data contract)

## Inlined Type Definitions

### SessionMeta

```typescript
/**
 * Local metadata for a session.
 * ACP has no session/list -- we own ALL session metadata.
 * The agent only provides conversation content (via session/load replay).
 */
export interface SessionMeta {
  /** Canonical ID: "{cliType}:{acpSessionId}" e.g., "claude-code:abc123" */
  id: string;
  /** Parent project ID */
  projectId: string;
  /** Which CLI type owns this session */
  cliType: CliType;
  /** Hidden from sidebar when true */
  archived: boolean;
  /** Session title -- derived from first user message, or "New Session" initially */
  title: string;
  /** ISO 8601 UTC -- last message activity. Updated on send/receive (not on open). */
  lastActiveAt: string;
  /** ISO 8601 UTC -- when session was created */
  createdAt: string;
}
```

### SessionListItem

```typescript
/** Session data for client display (derived entirely from SessionMeta) */
export interface SessionListItem {
  /** Canonical session ID */
  id: string;
  /** Session title */
  title: string;
  /** ISO 8601 UTC */
  lastActiveAt: string;
  /** CLI type */
  cliType: CliType;
}
```

### CliType

```typescript
export type CliType = 'claude-code' | 'codex';
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

### SessionManager Interface

```typescript
/**
 * Manages session metadata and coordinates with ACP agents.
 * Owns the session-to-project mapping layer AND session titles/timestamps.
 *
 * Key insight: ACP has no session/list method. We own session IDs, titles,
 * and timestamps locally. The agent only provides conversation content
 * (via session/load replay and session/prompt streaming).
 */
export class SessionManager {
  constructor(
    store: JsonStore<SessionMeta[]>,
    agentManager: AgentManager,
    projectStore: ProjectStore
  );

  /** Create session via ACP session/new and record local metadata.
   *  Title defaults to "New Session" until first user message. */
  async createSession(projectId: string, cliType: CliType): Promise<string>;

  /** Open session via ACP session/load, collect replayed history.
   *  Does NOT update lastActiveAt (only message send/receive updates it). */
  async openSession(canonicalId: string): Promise<ChatEntry[]>;

  /** List sessions for a project (entirely from local metadata).
   *  Filters out archived sessions. Sorts by lastActiveAt descending. */
  listSessions(projectId: string): SessionListItem[];

  /** Archive a session (local operation) */
  archiveSession(canonicalId: string): void;

  /** Send message to session via ACP session/prompt.
   *  Updates title (from first user message) and lastActiveAt (on send).
   *  Also updates lastActiveAt when agent response completes (on receive).
   *  onEvent fires for each streaming update. */
  async sendMessage(
    canonicalId: string,
    content: string,
    onEvent: (event: AcpUpdateEvent) => void
  ): Promise<AcpPromptResult>;

  /** Update session title (e.g., derived from first user message) */
  updateTitle(canonicalId: string, title: string): void;

  /** Convert between canonical and raw ACP IDs */
  static toCanonical(cliType: CliType, acpId: string): string;
  static fromCanonical(canonicalId: string): { cliType: CliType; acpId: string };
}
```

### ProjectStore Interface (for SessionManager dependency)

```typescript
interface ProjectStore {
  listProjects(): Promise<Array<{ id: string; path: string; name: string; addedAt: string }>>;
}
```

### Canonical ID Management

```
Canonical form (used everywhere in the app): "{cliType}:{acpSessionId}" e.g., "claude-code:abc123"
Raw ACP form (used only when talking to ACP): "abc123"

toCanonical(cliType, acpId) -> `${cliType}:${acpId}`
fromCanonical(canonicalId) -> { cliType, acpId }  (split on first ':')
```

### Session List Assembly Algorithm

Since ACP has no `session/list` method, session listing is entirely local. When the client sends `session:list { projectId }`:

1. Server looks up all `SessionMeta` entries for that project
2. Server filters out archived sessions (`archived !== true`)
3. Server sorts by `lastActiveAt` descending (most recent first)
4. Server maps to `SessionListItem[]` (id, title, lastActiveAt, cliType)
5. Server sends `session:list` response

No ACP calls required for listing. This is fast and works even when agent processes aren't running.

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
| { type: 'session:update'; sessionId: string; entry: ChatEntry }              // Story 3 scope: streaming
| { type: 'session:chunk'; sessionId: string; entryId: string; content: string } // Story 3 scope: streaming
| { type: 'session:complete'; sessionId: string; entryId: string }             // Story 3 scope: streaming
| { type: 'session:cancelled'; sessionId: string; entryId: string }            // Story 3 scope: cancel response
| { type: 'session:archived'; sessionId: string; requestId?: string }
| { type: 'session:title-updated'; sessionId: string; title: string }
| { type: 'error'; requestId?: string; message: string }
```

### Title Derivation

Session titles are derived from the first user message content, truncated to ~50 characters. When a session's title changes from "New Session" to the derived title, the server emits `session:title-updated { sessionId, title }`. This fires exactly once per session lifetime -- on the first `session:send` call.

## Task

### Files to Modify

1. **`server/sessions/session-manager.ts`** -- Update the existing stub to ensure it has:
   - Constructor accepting `JsonStore<SessionMeta[]>`, `AgentManager`, and `ProjectStore`
   - All methods from the interface above, each throwing `NotImplementedError`
   - Static methods `toCanonical` and `fromCanonical` -- these CAN be implemented now (pure logic, no side effects):
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
   - Private field `sessions: SessionMeta[]` initialized from store on construction (or lazy-loaded)

2. **`client/shell/sidebar.js`** -- Add session-related stubs to the existing sidebar module:
   - Function: `renderSessions(projectId, sessions)` -- renders session list under a project, throws NotImplementedError
   - Function: `showCliPicker(projectId)` -- shows CLI type selection (Claude Code / Codex), throws NotImplementedError
   - Function: `hideCliPicker()` -- hides CLI picker, throws NotImplementedError
   - A "New Session" button element within each project's expanded section
   - An archive action per session item
   - Keep all existing project-related functionality intact

### Test Files to Create/Modify

3. **`tests/server/session-manager.test.ts`** -- 10 tests (new file):

   ```
   TC-2.1a: local sessions listed with metadata
     Setup: Local store contains 3 SessionMeta entries for a project
     Assert: listSessions returns all 3 with title, lastActiveAt, cliType fields

   TC-2.1b: sessions sorted by lastActiveAt descending
     Setup: Sessions with different lastActiveAt timestamps
     Assert: Most recent first in returned list

   TC-2.1c: project with no sessions returns empty list
     Setup: No SessionMeta entries for the given projectId
     Assert: listSessions returns empty array

   TC-2.2a: create session records metadata locally
     Setup: Mock AgentManager.ensureAgent returns mock AcpClient; mock AcpClient.sessionNew returns { sessionId: 'abc123' }
     Assert: createSession returns canonical ID (e.g., "claude-code:abc123"); SessionMeta persisted with correct fields (projectId, cliType, title: "New Session", archived: false)

   TC-2.2f: create session propagates ACP error
     Setup: Mock AcpClient.sessionNew throws an error
     Assert: createSession throws/rejects with the error message

   TC-2.3a: open session returns history from ACP
     Setup: SessionMeta exists locally; mock AcpClient.sessionLoad returns ChatEntry[]
     Assert: openSession returns the ChatEntry array

   TC-2.4a: archive marks session as hidden from list
     Setup: Create a session, then archive it
     Assert: archiveSession sets archived: true; listSessions no longer includes it

   TC-2.4c: orphan sessions not in list (sessions without local metadata)
     Setup: No local SessionMeta for a given sessionId
     Assert: listSessions does not include it (implicit -- listing is local-only, so an ACP-only session never appears)

   TC-2.5a: sessions survive restart (persistence)
     Setup: Create sessions, simulate store persistence (write to store), create new SessionManager with same store
     Assert: listSessions on new manager returns the previously created sessions

   TC-2.5b: history loads from agent after restart
     Setup: Session persisted, new SessionManager created, mock AcpClient.sessionLoad returns entries
     Assert: openSession returns full history from ACP
   ```

4. **`tests/client/sidebar.test.ts`** -- Add 3 tests to the existing file:

   ```
   TC-2.2b: CLI type selection shows Claude Code and Codex
     Setup: Click "New Session" button under a project
     Assert: CLI picker is visible with two options: "Claude Code" and "Codex"

   TC-2.2c: cancel CLI selection returns to previous state
     Setup: Open CLI picker, click cancel
     Assert: Picker is hidden, no session:create message sent via WebSocket

   TC-2.4b: archive closes associated tab
     Setup: Session is listed and has an open tab
     Assert: After archive action, session removed from sidebar list and tab closed
   ```

### Test Structure Guidance

**Vitest import convention:** `import { describe, it, expect, vi } from 'vitest'` -- use `it` not `test`, include `vi` for mocking.

**`session-manager.test.ts`:**
- Import SessionManager, JsonStore, and mock the AgentManager + AcpClient
- Create a real JsonStore with a temp file (or mock the store's read/write)
- Use `describe('SessionManager', () => { ... })` with individual `it(...)` blocks
- Each test name must include the TC ID (e.g., `it('TC-2.1a: local sessions listed with metadata', ...)`)
- Mock data should use the SessionMeta shape exactly as defined above
- Tests should fail because the SessionManager methods throw NotImplementedError

**`sidebar.test.ts` additions:**
- Add tests to the existing describe block (or add a new nested describe for session-related tests)
- Use jsdom for DOM assertions
- Tests should fail because the sidebar session functions throw NotImplementedError

**Mock SessionMeta data for tests:**

```typescript
const mockSessions: SessionMeta[] = [
  {
    id: 'claude-code:session-1',
    projectId: 'project-1',
    cliType: 'claude-code',
    archived: false,
    title: 'Fix auth bug',
    lastActiveAt: '2026-02-05T10:00:00Z',
    createdAt: '2026-02-05T09:00:00Z',
  },
  {
    id: 'claude-code:session-2',
    projectId: 'project-1',
    cliType: 'claude-code',
    archived: false,
    title: 'Add unit tests',
    lastActiveAt: '2026-02-05T12:00:00Z',
    createdAt: '2026-02-05T11:00:00Z',
  },
  {
    id: 'codex:session-3',
    projectId: 'project-1',
    cliType: 'codex',
    archived: false,
    title: 'Refactor API',
    lastActiveAt: '2026-02-04T08:00:00Z',
    createdAt: '2026-02-04T07:00:00Z',
  },
];
```

## Constraints

- Do NOT implement the actual session management logic yet -- stubs only (except `toCanonical` and `fromCanonical` which are pure functions)
- Do NOT modify any files outside the specified list
- Use exact type names and field names from the inlined definitions above
- All non-static methods in SessionManager should throw `NotImplementedError` (imported from `server/errors.ts`)
- Tests must reference TC IDs in their test names
- Keep all existing sidebar functionality intact when adding session stubs
- Do NOT implement the WebSocket handler wiring for session messages yet

## If Blocked or Uncertain

- If you encounter inconsistencies between the inlined types and existing code, make the smallest assumption aligned to tech design and continue.
- If a hard blocker remains after reasonable assumptions, then ask a targeted question.

## Verification

Run the following commands:

```bash
# Typecheck should pass
bun run typecheck

# Full suite (mixed RED expected: prior stories pass, new Story 4 tests fail)
bun run test && bun run test:client

# Isolate new Story 4 server tests (should fail against unimplemented behavior)
bun run test -- tests/server/session-manager.test.ts
# Isolate new Story 4 client tests (the 3 new tests should fail)
bun run test:client -- tests/client/sidebar.test.ts
```

**Expected outcome:**
- `bun run typecheck`: 0 errors
- Full suite shows mixed RED results: ~45 passes (prior stories) and 13 failures/errors (new Story 4 tests)
- Isolated `session-manager` run shows failures attributable to unimplemented SessionManager behavior
- Isolated `sidebar` run shows the 3 new Story 4 tests failing against stubs

## Done When

- [ ] `server/sessions/session-manager.ts` has all methods stubbed, `toCanonical`/`fromCanonical` implemented
- [ ] `client/shell/sidebar.js` has session rendering stubs and "New Session" button structure
- [ ] `tests/server/session-manager.test.ts` exists with 10 tests, initially failing in RED
- [ ] `tests/client/sidebar.test.ts` has 3 new tests (7 total), 3 failing
- [ ] All 45 prior tests still pass
- [ ] `bun run typecheck` passes
- [ ] No files outside the specified list modified
