# Prompt 2a.R: Verify (ACP Client)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. Story 2a implemented the `AcpClient` class, which provides JSON-RPC 2.0 communication over stdio with ACP agent processes.

This verification prompt confirms that Story 2a is complete: all tests pass, typecheck is clean, no regressions from Story 1, and the implementation matches the spec.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `server/acp/acp-client.ts` -- fully implemented (from prompt 2a.2)
- `tests/server/acp-client.test.ts` -- 8 tests (from prompt 2a.1)
- All Story 0 and Story 1 files in place

## Reference Documents
(For human traceability)
- Tech Design: `docs/tech-design-mvp.md` (ACP Protocol Surface, AcpClient interface)
- Feature Spec: `docs/feature-spec-mvp.md` (Flow 5: Agent Connection Lifecycle)

## Task

Run the following verification checks and report results. Do NOT modify any files unless a check fails and requires a fix.

### 1. Full Test Suite

```bash
bun test
```

**Expected:** 17 total tests, all passing.
- 9 from Story 1 (project-store, sidebar)
- 8 from Story 2a (acp-client)

If any test fails, diagnose and fix. Report what was wrong and what you changed.

### 2. ACP Client Tests Only

```bash
bun test tests/server/acp-client.test.ts
```

**Expected:** 8 tests, all passing:
1. initialize sends correct protocol version and capabilities
2. sessionNew sends cwd parameter and returns sessionId
3. sessionLoad collects replayed history from update notifications
4. sessionPrompt fires onEvent for each update notification
5. sessionPrompt resolves with stopReason on completion
6. handleAgentRequest auto-approves permission requests
7. handles JSON-RPC error responses
8. close sends stdin close and waits for exit

### 3. Type Check

```bash
bun run typecheck
```

**Expected:** Zero errors.

### 4. No Regressions

```bash
bun test tests/server/project-store.test.ts
```

**Expected:** All Story 1 server tests still passing.

### 5. Implementation Audit

Verify the following by reading `server/acp/acp-client.ts`:

- [ ] Class has `initialize()`, `sessionNew()`, `sessionLoad()`, `sessionPrompt()`, `sessionCancel()`, `close()`, `onError()` methods
- [ ] `canLoadSession` getter returns boolean based on agent capabilities
- [ ] `initialize()` sends correct `protocolVersion: 1`, `clientInfo`, `clientCapabilities`
- [ ] Request IDs increment from 1
- [ ] `pendingRequests` Map correlates request IDs to resolve/reject promises
- [ ] Reading loop dispatches: responses (by id), notifications (by method), agent requests (by method + id)
- [ ] `session/update` notifications route to the active `notificationHandler`
- [ ] `sessionLoad` collects replayed `session/update` notifications into `ChatEntry[]`
- [ ] `sessionPrompt` fires `onEvent` callback for each `session/update` notification
- [ ] `session/request_permission` auto-approved with `{ approved: true }`
- [ ] JSON-RPC errors rejected with `new Error(error.message)`
- [ ] `close()` closes stdin and cleans up pending requests
- [ ] `onError()` stores error handler for broken pipe / parse errors
- [ ] No WebSocket or browser code present

### 6. Smoke Test Checklist

These are conceptual checks -- verify by reading the implementation:

- [ ] If the agent sends a malformed JSON line, the client logs it via errorHandler and continues reading (does not crash)
- [ ] If `close()` is called with pending requests, those requests are rejected
- [ ] `sessionCancel` sends a notification (no `id` field), not a request
- [ ] The reading loop handles the mock stdio's async iterator interface
- [ ] `updateEventToChatEntry` maps ACP status values correctly: pending/in_progress -> running, completed -> complete, failed -> error

## Constraints

- Do NOT modify files unless a verification check fails
- Do NOT add new features or tests
- Do NOT modify the test file
- Report results for each check: PASS or FAIL (with details)

## If Blocked or Uncertain

- If a test is flaky (passes sometimes, fails sometimes), report the flakiness pattern
- If typecheck reveals issues in files outside Story 2a scope, note them but do not fix
- Resolve straightforward implementation-vs-spec mismatches using source docs and continue; ask only for hard blockers

## Verification Summary Template

Report results in this format:

```
## Verification Results

### 1. Full Test Suite: PASS/FAIL
- Total: X tests
- Passing: X
- Failing: X
- Details: ...

### 2. ACP Client Tests: PASS/FAIL
- 8/8 passing
- Details: ...

### 3. Type Check: PASS/FAIL
- Errors: X
- Details: ...

### 4. No Regressions: PASS/FAIL
- Story 1 tests: X/X passing
- Details: ...

### 5. Implementation Audit: PASS/FAIL
- Checklist: X/X items verified
- Issues: ...

### 6. Smoke Test Checklist: PASS/FAIL
- Checklist: X/X items verified
- Issues: ...

### Overall: PASS/FAIL
```

## Done When

- [ ] All 17 tests pass
- [ ] Typecheck clean (zero errors)
- [ ] No regressions in Story 1 tests
- [ ] Implementation audit checklist complete
- [ ] Smoke test checklist complete
- [ ] Verification summary reported
