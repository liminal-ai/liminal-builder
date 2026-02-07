# Prompt 2b.R: Verify (Agent Manager + WebSocket Bridge)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. Story 2b implemented the `AgentManager` class, which manages the lifecycle of ACP agent processes: spawning, monitoring, reconnection with exponential backoff, and graceful shutdown.

This verification prompt confirms that Story 2b is complete: all tests pass, typecheck is clean, no regressions from Stories 1 and 2a, and the implementation matches the spec.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `server/acp/agent-manager.ts` -- fully implemented (from prompt 2b.2)
- `tests/server/agent-manager.test.ts` -- 10 tests (from prompt 2b.1)
- All Story 0, Story 1, and Story 2a files in place

## Reference Documents
(For human traceability)
- Tech Design: `docs/tech-design-mvp.md` (Agent Lifecycle State Machine, AgentManager interface, Flow 5, Error Contracts)
- Feature Spec: `docs/feature-spec-mvp.md` (AC-5.1, AC-5.3, AC-5.5, Flow 5)

## Task

Run the following verification checks and report results. Do NOT modify any files unless a check fails and requires a fix.

### 1. Full Test Suite

```bash
bun test
```

**Expected:** 27 total tests, all passing.
- 9 from Story 1 (project-store, sidebar)
- 8 from Story 2a (acp-client)
- 10 from Story 2b (agent-manager)

If any test fails, diagnose and fix. Report what was wrong and what you changed.

### 2. Agent Manager Tests Only

```bash
bun test tests/server/agent-manager.test.ts
```

**Expected:** 10 tests, all passing:
1. TC-5.1a: first session spawns agent
2. TC-5.1b: second session reuses process
3. TC-5.2a: connected status after init
4. TC-5.2b: disconnected on process exit
5. TC-5.2c: reconnecting on auto-retry
6. TC-5.2d: manual reconnect spawns new
7. TC-5.3a: shutdown terminates all
8. TC-5.5a: ENOENT shows install message
9. TC-5.5b: handshake failure shows connect error
10. TC-5.6b: agent survives WS disconnect

### 3. No Regressions -- Story 2a

```bash
bun test tests/server/acp-client.test.ts
```

**Expected:** 8 tests, all passing.

### 4. No Regressions -- Story 1

```bash
bun test tests/server/project-store.test.ts
```

**Expected:** All Story 1 server tests still passing.

### 5. Type Check

```bash
bun run typecheck
```

**Expected:** Zero errors.

### 6. Implementation Audit

Verify the following by reading `server/acp/agent-manager.ts`:

**Class structure:**
- [ ] `AgentManager` class exported
- [ ] `AgentStatus` type exported: `'idle' | 'starting' | 'connected' | 'disconnected' | 'reconnecting'`
- [ ] `AgentState` interface with: status, process, client, reconnectAttempts, reconnectTimer
- [ ] `AgentManagerDeps` interface for dependency injection (spawn, createClient)
- [ ] Constructor accepts `EventEmitter` and optional `AgentManagerDeps`
- [ ] Both CLI types initialized to idle in constructor

**State machine (verify transitions):**
- [ ] idle -> starting: on `ensureAgent()` call
- [ ] starting -> connected: on successful `initialize()`
- [ ] starting -> disconnected: on ENOENT or handshake failure
- [ ] connected -> disconnected: on process exit
- [ ] disconnected -> reconnecting: on auto-retry (attempts <= 5)
- [ ] reconnecting -> connected: on successful restart
- [ ] reconnecting -> disconnected: on retry exhaustion (attempts > 5)
- [ ] disconnected -> reconnecting: on `reconnect()` (manual, resets counter)

**Event emissions:**
- [ ] `agent:status` event emitted with `{ cliType, status }` on every transition
- [ ] `error` event emitted with `{ cliType, message }` on start failures
- [ ] "Check that it's installed" message on ENOENT
- [ ] "Could not connect to [name]" message on handshake failure

**Process management:**
- [ ] Uses `deps.spawn()` (not direct `Bun.spawn`) for testability
- [ ] Uses `deps.createClient()` (not direct `new AcpClient()`) for testability
- [ ] Monitors `proc.exited` promise for unexpected exit
- [ ] `AcpClient.onError` registered for client-level errors

**Reconnection:**
- [ ] Exponential backoff: `Math.min(1000 * 2^(attempt-1), 30000)`
- [ ] Maximum 5 auto-retry attempts
- [ ] `setTimeout` used for delayed retry
- [ ] Timer stored in `reconnectTimer` and cleared on shutdown/manual reconnect
- [ ] Manual reconnect resets `reconnectAttempts` to 0

**Shutdown:**
- [ ] `shuttingDown` flag prevents reconnection during shutdown
- [ ] All reconnect timers cleared
- [ ] `client.close(5000)` called for graceful shutdown
- [ ] Fallback to `proc.kill('SIGKILL')` on close failure
- [ ] `Promise.all` for parallel shutdown of all agents

**Reuse:**
- [ ] `ensureAgent` returns existing client when status is 'connected'
- [ ] No new spawn when agent already running

### 7. Smoke Test Checklist

These are conceptual checks -- verify by reading the implementation:

- [ ] If `ensureAgent('claude-code')` is called twice rapidly (before first completes), only one process is spawned (not a race condition)
- [ ] If a reconnect timer fires after `shutdownAll()`, no new process is spawned (shuttingDown flag checked)
- [ ] If `reconnect()` is called while an auto-retry timer is pending, the timer is cancelled and a fresh attempt starts
- [ ] The backoff delays are correct: attempt 1 = 1s, attempt 2 = 2s, attempt 3 = 4s, attempt 4 = 8s, attempt 5 = 16s
- [ ] `getStatus()` for an uninitialized CLI type returns 'idle' (not undefined)
- [ ] Agent state for 'claude-code' is independent of agent state for 'codex'

### 8. AC Traceability

Verify acceptance criteria coverage:

- [ ] **AC-5.1** (Auto-start): `ensureAgent()` spawns on first call, reuses on subsequent calls
- [ ] **AC-5.3** (Graceful shutdown): `shutdownAll()` closes stdin, waits, SIGKILL fallback
- [ ] **AC-5.5** (Start failure): ENOENT -> install message, handshake failure -> connect message

## Constraints

- Do NOT modify files unless a verification check fails
- Do NOT add new features or tests
- Do NOT modify test files
- Report results for each check: PASS or FAIL (with details)

## If Blocked or Uncertain

- If a test is flaky (passes sometimes, fails sometimes), report the flakiness pattern -- timing-dependent tests (TC-5.2c auto-retry) may need investigation
- If typecheck reveals issues in files outside Story 2b scope, note them but do not fix
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

### 2. Agent Manager Tests: PASS/FAIL
- 10/10 passing
- Details: ...

### 3. No Regressions (Story 2a): PASS/FAIL
- 8/8 passing

### 4. No Regressions (Story 1): PASS/FAIL
- X/X passing

### 5. Type Check: PASS/FAIL
- Errors: X

### 6. Implementation Audit: PASS/FAIL
- Checklist: X/X items verified
- Issues: ...

### 7. Smoke Test Checklist: PASS/FAIL
- Checklist: X/X items verified
- Issues: ...

### 8. AC Traceability: PASS/FAIL
- AC-5.1: covered/not covered
- AC-5.3: covered/not covered
- AC-5.5: covered/not covered

### Overall: PASS/FAIL
```

## Done When

- [ ] All 27 tests pass
- [ ] Typecheck clean (zero errors)
- [ ] No regressions in Story 1 or Story 2a tests
- [ ] Implementation audit checklist complete
- [ ] Smoke test checklist complete
- [ ] AC traceability verified
- [ ] Verification summary reported
