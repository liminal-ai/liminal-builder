# Prompt 4.R: Verify (Session Management)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. The stack is Bun + Fastify server, vanilla HTML/JS client using a shell/portlet (iframe) model, with WebSocket bridging the browser to ACP agent processes (Claude Code, Codex) running over JSON-RPC/stdio.

Story 4 implemented session CRUD, listing, persistence, and archive: the SessionManager on the server, WebSocket handler wiring for session messages, and session rendering in the sidebar. This verification phase confirms everything works correctly, with no regressions.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- Story 4 Green phase complete (session-manager.ts, websocket.ts, sidebar.js implemented)
- 13 new tests written across 2 test files
- 44 prior tests from Stories 0-3

## Reference Documents

(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Flow 2: Session Browsing & Creation)
- Feature Spec: `docs/feature-spec-mvp.md` (ACs 2.1-2.5)

## Task

### 1. Run All Tests

```bash
bun test
```

**Expected:** 57 tests pass, 0 fail.

Breakdown:
- `tests/server/project-store.test.ts`: 5 tests (Story 1)
- `tests/client/sidebar.test.ts`: 7 tests (Story 1: 4, Story 4: +3)
- `tests/server/acp-client.test.ts`: 8 tests (Story 2a)
- `tests/server/agent-manager.test.ts`: 10 tests (Story 2b)
- `tests/client/chat.test.ts`: 9 tests (Story 3)
- `tests/client/input.test.ts`: 5 tests (Story 3)
- `tests/client/portlet.test.ts`: 3 tests (Story 3)
- `tests/server/session-manager.test.ts`: 10 tests (Story 4) -- NEW
- `tests/client/sidebar.test.ts`: +3 tests (Story 4) -- NEW (added to existing file)

### 2. Run Typecheck

```bash
bun run typecheck
```

**Expected:** 0 errors.

### 3. Verify No Regressions

Run each prior story's tests in isolation:

```bash
# Story 1 tests
bun test tests/server/project-store.test.ts

# Story 2a tests
bun test tests/server/acp-client.test.ts

# Story 2b tests
bun test tests/server/agent-manager.test.ts

# Story 3 tests
bun test tests/client/chat.test.ts tests/client/input.test.ts tests/client/portlet.test.ts
```

**Expected:** All pass individually.

### 4. Verify Test Coverage by TC ID

Confirm each TC is covered by checking test names contain the TC ID:

| TC ID | Test File | Expected Test Name Contains |
|-------|-----------|---------------------------|
| TC-2.1a | `tests/server/session-manager.test.ts` | "TC-2.1a" |
| TC-2.1b | `tests/server/session-manager.test.ts` | "TC-2.1b" |
| TC-2.1c | `tests/server/session-manager.test.ts` | "TC-2.1c" |
| TC-2.2a | `tests/server/session-manager.test.ts` | "TC-2.2a" |
| TC-2.2b | `tests/client/sidebar.test.ts` | "TC-2.2b" |
| TC-2.2c | `tests/client/sidebar.test.ts` | "TC-2.2c" |
| TC-2.2f | `tests/server/session-manager.test.ts` | "TC-2.2f" |
| TC-2.3a | `tests/server/session-manager.test.ts` | "TC-2.3a" |
| TC-2.4a | `tests/server/session-manager.test.ts` | "TC-2.4a" |
| TC-2.4b | `tests/client/sidebar.test.ts` | "TC-2.4b" |
| TC-2.4c | `tests/server/session-manager.test.ts` | "TC-2.4c" |
| TC-2.5a | `tests/server/session-manager.test.ts` | "TC-2.5a" |
| TC-2.5b | `tests/server/session-manager.test.ts` | "TC-2.5b" |

### 5. Verify Canonical ID Helpers

Run a quick sanity check on the static ID helpers:

```bash
bun -e "
const { SessionManager } = await import('./server/sessions/session-manager');
const canonical = SessionManager.toCanonical('claude-code', 'abc123');
console.log('toCanonical:', canonical);
console.assert(canonical === 'claude-code:abc123', 'toCanonical failed');

const parsed = SessionManager.fromCanonical('claude-code:abc123');
console.log('fromCanonical:', parsed);
console.assert(parsed.cliType === 'claude-code', 'fromCanonical cliType failed');
console.assert(parsed.acpId === 'abc123', 'fromCanonical acpId failed');

// Edge case: colons in ACP ID
const edge = SessionManager.fromCanonical('codex:id:with:colons');
console.log('fromCanonical edge:', edge);
console.assert(edge.cliType === 'codex', 'edge cliType failed');
console.assert(edge.acpId === 'id:with:colons', 'edge acpId failed');

console.log('All canonical ID checks passed');
"
```

### 6. Verify Session List Assembly

Confirm the list assembly algorithm works correctly by examining the test output for TC-2.1a and TC-2.1b:

- TC-2.1a: Sessions have title, lastActiveAt, and cliType fields
- TC-2.1b: Sessions sorted by lastActiveAt descending (most recent first)
- Archived sessions are excluded
- Sessions for other projects are excluded

### 7. Verify Project Path Resolution Contract

Confirm SessionManager resolves `cwd` through ProjectStore rather than requiring callers to pass `projectPath` through WebSocket layers:

- [ ] SessionManager constructor accepts ProjectStore dependency
- [ ] `createSession(projectId, cliType)` resolves project path internally before `session/new`
- [ ] `openSession(sessionId)` resolves project path from `session.projectId` before `session/load`
- [ ] WebSocket `session:create` calls SessionManager without passing projectPath

### 8. Smoke Test Checklist (Manual)

If the server is runnable (`bun run dev`), perform these manual checks:

- [ ] Open the app in a browser at `http://localhost:3000`
- [ ] Add a project directory
- [ ] Expand the project in the sidebar -- session list loads (may be empty)
- [ ] Click "New Session" -- CLI picker appears with "Claude Code" and "Codex" options
- [ ] Cancel CLI selection -- picker dismisses, no session created
- [ ] Select "Claude Code" -- new session created, tab opens, session appears in sidebar
- [ ] Session shows title "New Session" initially
- [ ] Send a message -- session title updates to the first ~50 chars of the message
- [ ] Title updates in both the sidebar and tab bar
- [ ] Create a second session -- appears in sidebar, sorted by most recent
- [ ] Archive a session -- disappears from sidebar, tab closes (if open)
- [ ] Close and restart the server -- sessions reappear in sidebar (non-archived ones)
- [ ] Open a previously created session -- full conversation history loads from ACP agent
- [ ] Verify session list shows relative timestamps (e.g., "2m", "1h", "2d")

### 9. File Inventory Check

Verify the following files exist and were modified in this story:

```bash
ls -la server/sessions/session-manager.ts server/websocket.ts client/shell/sidebar.js
ls -la tests/server/session-manager.test.ts tests/client/sidebar.test.ts
```

## Constraints

- Do NOT modify any implementation or test files during verification
- If tests fail, report the failures with full error output -- do not fix them in this prompt
- If typecheck fails, report the errors -- do not fix them in this prompt

## If Blocked or Uncertain

- If any tests fail -- report the full error output and stop
- If typecheck has errors -- report them and stop
- Do NOT attempt fixes during the verification phase

## Verification

This entire prompt IS the verification. The expected outcomes are:

1. `bun test` -- 57 tests pass, 0 fail
2. `bun run typecheck` -- 0 errors
3. No regressions in prior story tests (Stories 0-3)
4. All 13 TC IDs present in test names
5. Canonical ID helpers work correctly (including edge cases with colons)
6. Session list assembly produces correct sorted, filtered output
7. Project path resolution contract is consistent (SessionManager owns cwd resolution)
8. Smoke test checklist completed (if server is runnable)
9. All required files exist

## Done When

- [ ] 57 tests pass (44 prior + 13 new)
- [ ] `bun run typecheck` passes with 0 errors
- [ ] No regressions in Stories 0-3 tests
- [ ] All 13 TC IDs confirmed present in test names
- [ ] Canonical ID helpers verified (including colon edge case)
- [ ] Project path resolution contract verified
- [ ] Smoke test checklist completed (or noted as blocked with reason)
- [ ] All required files exist and were modified
- [ ] Verification report provided with pass/fail for each check
