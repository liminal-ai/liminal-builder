# Prompt 6.R: FINAL Verify (Codex CLI + Connection Status + Integration)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs (Claude Code, Codex). Stack: Bun + Fastify server, vanilla HTML/JS client (shell/portlet iframes), WebSocket bridge. CLIs communicate via ACP (Agent Client Protocol) over stdio JSON-RPC.

This is the FINAL verification prompt for the entire Liminal Builder MVP. Story 6 is the last story. This prompt validates: all 94 tests pass, typecheck is clean, all acceptance criteria trace to test cases, all test cases trace to implementations, and the manual verification checklist is ready for human execution.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- All MVP stories implemented (0, 1, 2a, 2b, 3, 4, 5, 6)
- All source files in place
- All test files written and expected to pass

## Reference Documents
(For human traceability)
- Tech Design: `docs/tech-design-mvp.md` (full document)
- Feature Spec: `docs/feature-spec-mvp.md` (full document)

## Task

### Step 1: Run ALL Tests

```bash
bun run test && bun run test:client && bun run test:integration
```

**Expected:** All tests PASS, zero failures.

Verify the complete breakdown across all 10 test files:

| Test File | # Tests | Story | TCs Covered |
|-----------|---------|-------|-------------|
| `tests/server/project-store.test.ts` | 5 | Story 1 | TC-1.1a, TC-1.2a, TC-1.2b, TC-1.2d, TC-1.3a |
| `tests/server/acp-client.test.ts` | 9 | Story 2a | Protocol correctness (init, session/new, load, prompt, permission, error, sessionCancel, close) |
| `tests/server/agent-manager.test.ts` | 11 | Story 2b | TC-5.1a-b, TC-5.2a-d, TC-5.3a, TC-5.5a-b, TC-5.6b |
| `tests/server/session-manager.test.ts` | 10 | Story 4 | TC-2.1a-c, TC-2.2a, TC-2.2f, TC-2.3a, TC-2.4a, TC-2.4c, TC-2.5a-b |
| `tests/server/websocket.test.ts` | 16 | Stories 4+6 | Existing WS handler tests (10) + Integration round-trips (`project:add`, `session:create`, `session:send`, `session:cancel`, `project:remove`, `session:create` failure), TC-2.2f, TC-3.7b |
| `tests/client/sidebar.test.ts` | 7 | Stories 1+4 | TC-1.1b, TC-1.2c, TC-1.4a, TC-1.4b, TC-2.2b, TC-2.2c, TC-2.4b |
| `tests/client/chat.test.ts` | 9 | Story 3 | TC-3.2a-b, TC-3.3a-c, TC-3.4a, TC-3.6a-c |
| `tests/client/input.test.ts` | 5 | Story 3 | TC-3.1b, TC-3.5a, TC-3.5b, TC-3.7a, TC-3.7c |
| `tests/client/portlet.test.ts` | 3 | Story 3 | TC-3.1a, TC-5.4a, TC-3.7b |
| `tests/client/tabs.test.ts` | 19 | Stories 5+6 | TC-4.1a-b, TC-4.2a, TC-4.3a-b, TC-4.4a-c, TC-4.5a-b, TC-4.6a-b, TC-4.7a, TC-2.3b, TC-5.6a + 4 relay integration tests |

**Total: 94 tests**

**Action:** Count the actual test numbers from each file. If the total does not match 94, report which files have unexpected counts.

Traceability notes:
- AC-5.2 UI behaviors (status dot rendering, disabled input, reconnect button visibility) are validated manually in Gorilla testing for Story 6.
- TC-2.2e (Codex end-to-end) is manual/Gorilla. Automated Story 6 integration tests use `cliType: 'claude-code'`; Codex differs in `ACP_COMMANDS` binary lookup.
- TC-2.2f intentionally has dual coverage: Story 4 unit (`tests/server/session-manager.test.ts`) plus Story 6 integration (`tests/server/websocket.test.ts`).

### Step 2: Run Typecheck

```bash
bun run typecheck
```

**Expected:** zero errors.

### Step 2.5: Run Canonical Verify Gates

```bash
bun run verify
bun run verify-all
```

**Expected:** both commands pass.

### Step 3: FULL Traceability Matrix

This is the complete AC-to-TC-to-Implementation mapping for the entire MVP. Verify that every AC has at least one TC, every TC appears in a test file, and every test exercises real implementation code (not stubs).

**Flow 1: Project Directory Management**

| AC | TC | Test File | Implementation File |
|----|-----|-----------|-------------------|
| AC-1.1 | TC-1.1a | `tests/server/project-store.test.ts` | `server/projects/project-store.ts` |
| AC-1.1 | TC-1.1b | `tests/client/sidebar.test.ts` | `client/shell/sidebar.js` |
| AC-1.2 | TC-1.2a | `tests/server/project-store.test.ts` | `server/projects/project-store.ts` |
| AC-1.2 | TC-1.2b | `tests/server/project-store.test.ts` | `server/projects/project-store.ts` |
| AC-1.2 | TC-1.2c | `tests/client/sidebar.test.ts` | `client/shell/sidebar.js` |
| AC-1.2 | TC-1.2d | `tests/server/project-store.test.ts` | `server/projects/project-store.ts` |
| AC-1.3 | TC-1.3a | `tests/server/project-store.test.ts` | `server/projects/project-store.ts` |
| AC-1.3 | TC-1.3b | Manual/Gorilla (remove project with open tabs) | `client/shell/sidebar.js` + `client/shell/tabs.js` + `server/websocket.ts` |
| AC-1.4 | TC-1.4a | `tests/client/sidebar.test.ts` | `client/shell/sidebar.js` |
| AC-1.4 | TC-1.4b | `tests/client/sidebar.test.ts` | `client/shell/sidebar.js` |

**Flow 2: Session Browsing & Creation**

| AC | TC | Test File | Implementation File |
|----|-----|-----------|-------------------|
| AC-2.1 | TC-2.1a | `tests/server/session-manager.test.ts` | `server/sessions/session-manager.ts` |
| AC-2.1 | TC-2.1b | `tests/server/session-manager.test.ts` | `server/sessions/session-manager.ts` |
| AC-2.1 | TC-2.1c | `tests/server/session-manager.test.ts` | `server/sessions/session-manager.ts` |
| AC-2.2 | TC-2.2a | `tests/server/session-manager.test.ts` | `server/sessions/session-manager.ts` |
| AC-2.2 | TC-2.2b | `tests/client/sidebar.test.ts` | `client/shell/sidebar.js` |
| AC-2.2 | TC-2.2c | `tests/client/sidebar.test.ts` | `client/shell/sidebar.js` |
| AC-2.2 | TC-2.2d | Manual/Gorilla | End-to-end with real Claude Code |
| AC-2.2 | TC-2.2e | Manual/Gorilla | End-to-end with real Codex |
| AC-2.2 | TC-2.2f | `tests/server/websocket.test.ts` | `server/websocket.ts` |
| AC-2.3 | TC-2.3a | `tests/server/session-manager.test.ts` | `server/sessions/session-manager.ts` |
| AC-2.3 | TC-2.3b | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| AC-2.4 | TC-2.4a | `tests/server/session-manager.test.ts` | `server/sessions/session-manager.ts` |
| AC-2.4 | TC-2.4b | `tests/client/sidebar.test.ts` | `client/shell/sidebar.js` |
| AC-2.4 | TC-2.4c | `tests/server/session-manager.test.ts` | `server/sessions/session-manager.ts` |
| AC-2.5 | TC-2.5a | `tests/server/session-manager.test.ts` | `server/sessions/session-manager.ts` |
| AC-2.5 | TC-2.5b | `tests/server/session-manager.test.ts` | `server/sessions/session-manager.ts` |

**Flow 3: Chat Interaction**

| AC | TC | Test File | Implementation File |
|----|-----|-----------|-------------------|
| AC-3.1 | TC-3.1a | `tests/client/portlet.test.ts` | `client/portlet/portlet.js` |
| AC-3.1 | TC-3.1b | `tests/client/input.test.ts` | `client/portlet/input.js` |
| AC-3.2 | TC-3.2a | `tests/client/chat.test.ts` | `client/portlet/chat.js` |
| AC-3.2 | TC-3.2b | `tests/client/chat.test.ts` | `client/portlet/chat.js` |
| AC-3.3 | TC-3.3a | `tests/client/chat.test.ts` | `client/portlet/chat.js` |
| AC-3.3 | TC-3.3b | `tests/client/chat.test.ts` | `client/portlet/chat.js` |
| AC-3.3 | TC-3.3c | `tests/client/chat.test.ts` | `client/portlet/chat.js` |
| AC-3.4 | TC-3.4a | `tests/client/chat.test.ts` | `client/portlet/chat.js` |
| AC-3.5 | TC-3.5a | `tests/client/input.test.ts` | `client/portlet/input.js` |
| AC-3.5 | TC-3.5b | `tests/client/input.test.ts` | `client/portlet/input.js` |
| AC-3.6 | TC-3.6a | `tests/client/chat.test.ts` | `client/portlet/chat.js` |
| AC-3.6 | TC-3.6b | `tests/client/chat.test.ts` | `client/portlet/chat.js` |
| AC-3.6 | TC-3.6c | `tests/client/chat.test.ts` | `client/portlet/chat.js` |
| AC-3.7 | TC-3.7a | `tests/client/input.test.ts` | `client/portlet/input.js` |
| AC-3.7 | TC-3.7b | `tests/client/portlet.test.ts` + `tests/server/websocket.test.ts` | `client/portlet/portlet.js` + `server/websocket.ts` |
| AC-3.7 | TC-3.7c | `tests/client/input.test.ts` | `client/portlet/input.js` |

**Flow 4: Tab Management**

| AC | TC | Test File | Implementation File |
|----|-----|-----------|-------------------|
| AC-4.1 | TC-4.1a | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| AC-4.1 | TC-4.1b | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| AC-4.2 | TC-4.2a | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| AC-4.2 | TC-4.2b | Manual/Performance | `client/shell/tabs.js` |
| AC-4.3 | TC-4.3a | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| AC-4.3 | TC-4.3b | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| AC-4.4 | TC-4.4a | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| AC-4.4 | TC-4.4b | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| AC-4.4 | TC-4.4c | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| AC-4.5 | TC-4.5a | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| AC-4.5 | TC-4.5b | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| AC-4.6 | TC-4.6a | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| AC-4.6 | TC-4.6b | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| AC-4.7 | TC-4.7a | `tests/client/tabs.test.ts` | `client/shell/tabs.js` |
| -- | -- (relay) | `tests/client/tabs.test.ts` | `client/shell/shell.js` + `client/shell/tabs.js` (WS→portlet routing, portlet→WS with sessionId injection, session:created auto-open, unknown session drop) |

**Flow 5: Agent Connection Lifecycle**

| AC | TC | Test File | Implementation File |
|----|-----|-----------|-------------------|
| AC-5.1 | TC-5.1a | `tests/server/agent-manager.test.ts` | `server/acp/agent-manager.ts` |
| AC-5.1 | TC-5.1b | `tests/server/agent-manager.test.ts` | `server/acp/agent-manager.ts` |
| AC-5.2 | TC-5.2a | `tests/server/agent-manager.test.ts` + Manual/Gorilla UI check | `server/acp/agent-manager.ts` + `client/portlet/portlet.js` |
| AC-5.2 | TC-5.2b | `tests/server/agent-manager.test.ts` + Manual/Gorilla UI check | `server/acp/agent-manager.ts` + `client/portlet/portlet.js` + `client/portlet/input.js` + `client/shell/sidebar.js` |
| AC-5.2 | TC-5.2c | `tests/server/agent-manager.test.ts` + Manual/Gorilla UI check | `server/acp/agent-manager.ts` + `client/portlet/portlet.js` + `client/portlet/input.js` |
| AC-5.2 | TC-5.2d | `tests/server/agent-manager.test.ts` + Manual/Gorilla UI check | `server/acp/agent-manager.ts` + `client/shell/sidebar.js` |
| AC-5.3 | TC-5.3a | `tests/server/agent-manager.test.ts` | `server/acp/agent-manager.ts` |
| AC-5.4 | TC-5.4a | `tests/client/portlet.test.ts` | `client/portlet/portlet.js` |
| AC-5.5 | TC-5.5a | `tests/server/agent-manager.test.ts` | `server/acp/agent-manager.ts` |
| AC-5.5 | TC-5.5b | `tests/server/agent-manager.test.ts` | `server/acp/agent-manager.ts` |
| AC-5.6 | TC-5.6a | `tests/client/tabs.test.ts` | `client/shell/tabs.js` + `client/shell/shell.js` |
| AC-5.6 | TC-5.6b | `tests/server/agent-manager.test.ts` | `server/acp/agent-manager.ts` |

Manual-only note for Story 6: there are no dedicated automated client tests for AC-5.2 UI rendering details (status-dot class, disconnected input disable, reconnect button visibility). Validate those via Gorilla checklist.

**Action:** For each row, verify the TC ID appears in the test file's test descriptions. Report any missing TC IDs.

### Step 4: Implementation Completeness Checks

Verify these critical implementations exist and are not stubs:

**Server:**

1. **`server/acp/agent-manager.ts`**: `ACP_COMMANDS` has both `claude-code` and `codex` entries
2. **`server/acp/agent-manager.ts`**: State machine handles: idle, starting, connected, disconnected, reconnecting
3. **`server/acp/agent-manager.ts`**: Exponential backoff reconnection: 1s, 2s, 4s, 8s, 16s, cap 30s, 5 retries
4. **`server/acp/agent-manager.ts`**: Graceful shutdown: close stdin, wait 5s, SIGKILL
5. **`server/acp/acp-client.ts`**: JSON-RPC framing over stdio, request correlation, streaming
6. **`server/websocket.ts`**: All 10 client message types handled (project:add/remove/list, session:list/create/open/send/cancel/archive/reconnect). The `session:reconnect` handler calls `agentManager.reconnect()` (not a stub).
6a. **`server/index.ts`**: SIGINT/SIGTERM handlers call `agentManager.shutdownAll()` then `app.close()`
7. **`server/websocket.ts`**: All 14 server message types emitted
8. **`server/sessions/session-manager.ts`**: Session CRUD, canonical ID management, title derivation
9. **`server/projects/project-store.ts`**: Project CRUD with path validation and duplicate detection
10. **`server/store/json-store.ts`**: Atomic writes (write to temp, rename)

**Client:**

11. **`client/shell/shell.js`**: WebSocket reconnection with backoff (500ms, 1s, 2s, 4s, cap 5s, no retry limit)
12. **`client/shell/shell.js`**: Resync on reconnect (re-sends project:list, session:list for expanded projects)
13. **`client/shell/tabs.js`**: Full iframe lifecycle (Map, CSS toggle, dedup, close adjacent, drag-and-drop, localStorage)
14. **`client/shell/sidebar.js`**: Project list, session list, collapse/expand, reconnect button
15. **`client/portlet/portlet.js`**: Connection status indicator (dot with color by state)
16. **`client/portlet/chat.js`**: Streaming rendering (raw during chunks, markdown on complete), auto-scroll
17. **`client/portlet/input.js`**: Input bar with disabled state during response, cancel button
18. **`client/shared/markdown.js`**: marked + DOMPurify

**Action:** For each item, confirm the implementation exists and is not a stub (does not throw `NotImplementedError` or `Error('Not implemented')`). Report any remaining stubs.

### Step 5: Manual Verification Checklist (Gorilla Testing)

This is the full manual verification checklist from the tech design (15 items). This checklist is for human execution after all automated tests pass. Document it here for the verifier.

**Prerequisites:** Server running (`bun run start`), browser open at `http://localhost:3000`

| # | Step | Expected Result | AC |
|---|------|----------------|-----|
| 1 | Start server: `bun run start` | Server starts, logs listening port | Infrastructure |
| 2 | Open browser: `http://localhost:3000` | Shell page loads with sidebar, tab bar, empty portlet area | Infrastructure |
| 3 | Add a project directory | Project appears in sidebar | AC-1.2 |
| 4 | Create a Claude Code session, send a message | Streaming response renders: user turn, assistant turn with markdown, tool calls with status, thinking blocks | AC-2.2, TC-2.2d |
| 5 | Send a message that triggers tool calls | Tool call name + running indicator, then collapsed result | AC-3.3 |
| 6 | Open a second session | Second tab appears, first tab remains | AC-4.1 |
| 7 | Switch between tabs | Instant switching (<100ms), scroll position preserved | AC-4.2 |
| 8 | Close a tab | Session remains in sidebar, tab removed | AC-4.4 |
| 9 | Collapse/expand a project folder | Sessions hidden/shown, state persists | AC-1.4 |
| 10 | Archive a session | Removed from sidebar, tab closed if open | AC-2.4 |
| 11 | Refresh browser | Tabs restore, agent processes survive, can continue chatting | AC-5.6 |
| 12 | Stop and restart server | Tabs restore from localStorage on page load | AC-4.7 |
| 13 | Create a Codex session, send a message | Full streaming response, same rendering as Claude Code | TC-2.2e |
| 14 | Kill an agent process (externally) | Disconnected state shown, reconnect button visible | AC-5.2 |
| 15 | Click reconnect | Agent process restarts, status returns to connected | AC-5.2 |

**Note:** Items 4, 5, 13, 14, 15 require real CLI installations (claude-code-acp, codex-acp). If CLIs are not available, these items should be deferred to integration testing with real adapters.

### Step 6: Final Test Count Reconciliation

Verify the running totals match the plan:

| Story | Tests Added | Running Total |
|-------|------------|---------------|
| Story 0 | 0 | 0 |
| Story 1 | 9 | 9 |
| Story 2a | 9 | 18 |
| Story 2b | 11 | 29 |
| Story 3 | 17 | 46 |
| Story 4 | 23 | 69 |
| Story 5 | 18 | 87 |
| Story 6 | 7 | **94** |

Note: Stories 2b-4 have higher counts than originally planned due to verification fix rounds that added tests. The 69 baseline was confirmed by running `bun run test && bun run test:client` before Story 5.

**Action:** Use Step 1 script outputs (`bun run test && bun run test:client && bun run test:integration`) to confirm total is exactly 94.

## Constraints

- Do NOT modify any source files during verification
- If tests fail, report the failures with full output but do NOT fix them
- If typecheck fails, report the errors but do NOT fix them
- If traceability gaps are found, report them but do NOT implement fixes
- This is a read-only verification pass

## If Blocked or Uncertain

- If test count does not match 94, report the actual count and identify which tests are missing or extra
- If any AC has no corresponding TC in a test file, report it as a traceability gap
- If any implementation file still has stubs, report which functions are not implemented

## Verification

This IS the final verification prompt. Success criteria:

1. `bun run test && bun run test:client && bun run test:integration` -- 94 tests, zero failures
2. `bun run typecheck` -- zero errors
3. `bun run verify` and `bun run verify-all` -- pass
4. Full traceability matrix verified -- all ACs have TCs, all TCs appear in test files
5. All 18 implementation completeness checks pass (no remaining stubs)
6. Manual verification checklist documented and ready for human execution
7. Test count reconciliation matches the plan (94 total)

## Done When

- [ ] 94 tests PASS, zero failures
- [ ] `bun run typecheck` passes with zero errors
- [ ] `bun run verify` passes
- [ ] `bun run verify-all` passes
- [ ] All 5 flows traced: AC -> TC -> test file -> implementation file
- [ ] No remaining stubs (all functions implemented)
- [ ] Manual verification checklist documented (15 items)
- [ ] Test count reconciliation confirmed: 94 total across 10 test files
- [ ] **The Liminal Builder MVP is COMPLETE**
