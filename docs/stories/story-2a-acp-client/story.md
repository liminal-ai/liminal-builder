# Story 2a: ACP Client (Protocol Layer)

## Overview

Story 2a implements the ACP (Agent Client Protocol) client -- the JSON-RPC 2.0 protocol layer that communicates with CLI agent processes over stdio. This is pure protocol plumbing: newline-delimited JSON-RPC framing, request/response correlation, streaming notification handling, and bidirectional message routing. No WebSocket or browser integration.

This story isolates ACP protocol risk. The ACP protocol has unvalidated assumptions (Q3 auth, Q5 session/load support, Q6 auto-approve). If the protocol behaves differently than expected, the blast radius is contained to 2a. Story 2b (Agent Manager + WebSocket Bridge) can only start after 2a confirms the protocol works.

The AcpClient class wraps stdin/stdout of a child process and provides typed methods for all ACP operations: `initialize`, `session/new`, `session/load`, `session/prompt`, `session/cancel`. It also handles agent-to-client requests like `session/request_permission` (auto-approved in MVP).

## Prerequisites

- Story 0 complete: all type definitions exist (`server/acp/acp-types.ts`), error classes exist (`server/errors.ts`), AcpClient stub exists (`server/acp/acp-client.ts`)
- Story 1 is not a functional dependency for Story 2a. Verification baseline is either:
  - Story 0 only (parallel track): 0 prior server tests
  - Story 0 + Story 1 complete: 9 prior server tests
- Working directory: `/Users/leemoore/code/liminal-builder`

## ACs Covered

| AC | Coverage | Notes |
|----|----------|-------|
| AC-5.1 | Partial | Agent process spawning protocol (initialize handshake) |
| AC-5.3 | Partial | Process termination (close stdin, wait, SIGKILL) |

## Files

### New Files

| File | Contents |
|------|----------|
| `tests/server/acp-client.test.ts` | 9 tests covering ACP protocol correctness (including `sessionCancel` notification semantics) |

### Modified Files

| File | Changes |
|------|---------|
| `server/acp/acp-client.ts` | Full implementation replacing stubs |

### Existing Files (unchanged, for reference)

| File | Role |
|------|------|
| `server/acp/acp-types.ts` | JSON-RPC types, ACP event/result types |
| `server/errors.ts` | NotImplementedError, AppError |
| `shared/types.ts` | ChatEntry discriminated union |

## Test Breakdown

| Test File | # Tests | TCs Covered | Description |
|-----------|---------|-------------|-------------|
| `tests/server/acp-client.test.ts` | 9 | Protocol correctness | init, session/new, session/load replay, session/prompt streaming, permission auto-approve, error handling, `sessionCancel` notification semantics, close |

**Story 2a test count: 9**

| Phase | This Story | Cumulative |
|-------|-----------|------------|
| Previous baseline | -- | 0 (Story 0 only) or 9 (Story 0 + 1) |
| Story 2a | 9 | 9 (parallel track) or 18 (with Story 1 complete) |

## Prompts

| Prompt | Phase | Description |
|--------|-------|-------------|
| `prompt-2a.1-skeleton-red.md` | Skeleton + Red | AcpClient class stubs + 9 failing tests |
| `prompt-2a.2-green.md` | Green | Full AcpClient implementation |
| `prompt-2a.R-verify.md` | Verify | All tests pass, `bun run verify` clean |

## Exit Criteria

- 9 new AcpClient tests PASS; all prior tests still PASS (if present in the branch)
- `bun run verify` passes (format:check, lint, typecheck, test)
- `bun run verify-all` passes (verify + client tests + integration + e2e)
- `bun run typecheck` passes with zero errors
- AcpClient can: initialize handshake, create sessions, load sessions with history replay, prompt with streaming callbacks, auto-approve permissions, handle JSON-RPC errors, close gracefully
