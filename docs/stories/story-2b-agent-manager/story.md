# Story 2b: Agent Manager + WebSocket Bridge

## Overview

Story 2b implements the Agent Manager -- the process lifecycle layer that spawns, monitors, reconnects, and shuts down ACP agent processes. It also wires the WebSocket handler to route session operations (`session:create`, `session:send`, `session:cancel`, `session:open`) through the Agent Manager to the AcpClient from Story 2a.

The Agent Manager runtime scope for Story 2b is `claude-code` only: idle -> starting -> connected -> disconnected -> reconnecting. It spawns a process on demand, monitors for crashes, implements exponential backoff reconnection (1s, 2s, 4s, 8s, 16s, cap 30s; 5 auto-retries), and handles graceful shutdown (close stdin, wait 5s, SIGKILL). `codex` runtime support is deferred to Story 6.

This story builds directly on Story 2a's AcpClient. Tests mock `Bun.spawn` to avoid requiring real CLI binaries.

## Prerequisites

- Story 0 complete: all type definitions, error classes, stubs
- Story 2a complete: AcpClient fully implemented (9 Story 2a tests; running total is branch-dependent and is often 18 when Story 1 is also complete)
- Working directory: `/Users/leemoore/code/liminal-builder`

## ACs Covered

| AC | Coverage | Notes |
|----|----------|-------|
| AC-5.1 | Full | Auto-start agent on first session, reuse existing process |
| AC-5.2 | Partial | AC-5.2 partial (state tracking only, UI indicators deferred to Story 6) -- bonus scope beyond feature spec Story 2b summary |
| AC-5.3 | Full | Graceful shutdown (close stdin, wait 5s, SIGKILL) |
| AC-5.5 | Full | Agent start failure (ENOENT, handshake failure) |

## TCs Covered

| TC | Description |
|----|-------------|
| TC-5.1a | First session spawns agent |
| TC-5.1b | Second session reuses process |
| TC-5.2a | Connected status after init |
| TC-5.2b | Disconnected on process exit |
| TC-5.2c | Reconnecting on auto-retry |
| TC-5.2d | Manual reconnect spawns new |
| TC-5.3a | Shutdown terminates all |
| TC-5.5a | ENOENT shows install message |
| TC-5.5b | Handshake failure shows connect error |
| TC-5.6b | Agent survives WS disconnect |

## Files

### New Files

| File | Contents |
|------|----------|
| `tests/server/agent-manager.test.ts` | 10 tests covering agent lifecycle |

### Modified Files

| File | Changes |
|------|---------|
| `server/acp/agent-manager.ts` | Full implementation replacing stubs |
| `server/websocket.ts` | Route WS session operations through AgentManager and forward agent events |

### Existing Files (unchanged, for reference)

| File | Role |
|------|------|
| `server/acp/acp-client.ts` | AcpClient (from Story 2a) -- mocked in tests |
| `server/acp/acp-types.ts` | ACP protocol types |
| `server/sessions/session-types.ts` | CliType |
| `server/errors.ts` | NotImplementedError, AppError |

## Test Breakdown

| Test File | # Tests | TCs Covered | Description |
|-----------|---------|-------------|-------------|
| `tests/server/agent-manager.test.ts` | 10 | TC-5.1a-b, TC-5.2a-d, TC-5.3a, TC-5.5a-b, TC-5.6b | Agent lifecycle state machine |
| `tests/server/websocket.test.ts` | 5 | `session:create/open/send/cancel` routing + `agent:status/error` forwarding + `requestId` correlation | WebSocket bridge integration with AgentManager |

**Story 2b WS bridge cases (minimum 5 tests with concrete mocks/assertions):**
1. `session:create` routes to `ensureAgent` then `client.sessionNew`, and replies with `session:created` including `requestId` when provided.
2. `session:send` routes to `ensureAgent` then `client.sessionPrompt`.
3. `session:cancel` routes to `ensureAgent` then `client.sessionCancel`.
4. AgentManager `agent:status` events are forwarded as WS `agent:status`.
5. AgentManager `error` events are forwarded as WS `error`, preserving `requestId` when correlated.

**Story 2b test scope:** 10 AgentManager lifecycle tests plus 5 WS bridge routing/forwarding tests.

| Phase | This Story | Cumulative |
|-------|-----------|------------|
| Previous baseline (Story 0 + 2a minimum; Story 1 optional in sequential flow) | -- | Branch-dependent (commonly 17) |
| Story 2b | AgentManager + WS bridge coverage | Updated in verify run |

## Prompts

| Prompt | Phase | Description |
|--------|-------|-------------|
| `prompt-2b.1-skeleton-red.md` | Skeleton + Red | AgentManager stubs + 10 failing tests |
| `prompt-2b.2-green.md` | Green | Full AgentManager implementation |
| `prompt-2b.R-verify.md` | Verify | Story 2b tests pass, typecheck clean, and cumulative totals are validated against the branch baseline |

## Exit Criteria

- `bun run test` passes for all server Vitest tests (including Story 2b AgentManager + WS bridge coverage)
- `bun run verify` passes (`format:check`, `lint`, `typecheck`, `test`)
- `bun run typecheck` passes with zero errors
- Agent Manager can: spawn agents on demand, reuse existing processes, track lifecycle state, reconnect with exponential backoff, handle start failures, shut down gracefully
- WebSocket bridge in `server/websocket.ts` can: route `session:create/open/send/cancel` through AgentManager, preserve `requestId` correlation fields, and forward `agent:status` / `error` to connected clients
