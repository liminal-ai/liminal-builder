# Story 2b: Agent Manager + WebSocket Bridge

## Overview

Story 2b implements the Agent Manager -- the process lifecycle layer that spawns, monitors, reconnects, and shuts down ACP agent processes. It also wires the WebSocket handler to route session operations (`session:create`, `session:send`, `session:cancel`, `session:open`) through the Agent Manager to the AcpClient from Story 2a.

The Agent Manager maintains a state machine per CLI type (claude-code, codex): idle -> starting -> connected -> disconnected -> reconnecting. It spawns one process per CLI type on demand, monitors for crashes, implements exponential backoff reconnection (1s, 2s, 4s, 8s, 16s, cap 30s; 5 auto-retries), and handles graceful shutdown (close stdin, wait 5s, SIGKILL).

This story builds directly on Story 2a's AcpClient. Tests mock `Bun.spawn` to avoid requiring real CLI binaries.

## Prerequisites

- Story 0 complete: all type definitions, error classes, stubs
- Story 1 complete: 9 tests passing
- Story 2a complete: AcpClient fully implemented, 17 tests passing
- Working directory: `/Users/leemoore/code/liminal-builder`

## ACs Covered

| AC | Coverage | Notes |
|----|----------|-------|
| AC-5.1 | Full | Auto-start agent on first session, reuse existing process |
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

**Story 2b test count: 10**

| Phase | This Story | Cumulative |
|-------|-----------|------------|
| Previous (Story 0 + 1 + 2a) | -- | 17 |
| Story 2b | 10 | 27 |

## Prompts

| Prompt | Phase | Description |
|--------|-------|-------------|
| `prompt-2b.1-skeleton-red.md` | Skeleton + Red | AgentManager stubs + 10 failing tests |
| `prompt-2b.2-green.md` | Green | Full AgentManager implementation |
| `prompt-2b.R-verify.md` | Verify | All 27 tests pass, typecheck clean |

## Exit Criteria

- 27 tests PASS total (17 previous + 10 new)
- `bun run typecheck` passes with zero errors
- Agent Manager can: spawn agents on demand, reuse existing processes, track lifecycle state, reconnect with exponential backoff, handle start failures, shut down gracefully
