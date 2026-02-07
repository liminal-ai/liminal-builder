# Story 6: Codex CLI + Connection Status + Integration

## Overview

Story 6 is the final story of the Liminal Builder MVP. It adds four capabilities and provides end-to-end integration validation:

1. **Codex CLI support** -- Add Codex as a second CLI type in the agent manager with its command configuration, completing the dual-CLI design.
2. **Connection status indicators** -- Visual status dots in the session header and sidebar showing agent connection state (starting/connected/disconnected/reconnecting), plus a reconnect button per CLI type when disconnected.
3. **Browser refresh recovery** -- WebSocket reconnection with exponential backoff on the browser side, plus localStorage-based tab restoration on refresh. Agent processes survive browser refresh because they are server-managed.
4. **WebSocket integration tests** -- Full round-trip tests verifying the message pipeline from WebSocket client through server to mocked ACP and back.

This story brings the total test count to 79, completing the MVP test suite.

## Prerequisites

- Operational prerequisite: Stories 0-5 complete (sequential pipeline): 72 tests passing
- Architectural dependency: Story 2b (agent manager lifecycle/reconnect foundation)
- Working directory: `/Users/leemoore/code/liminal-builder`
- `server/acp/agent-manager.ts` has AgentManager with lifecycle state machine
- `client/shell/shell.js` has WebSocket connection
- `client/shell/tabs.js` has full tab lifecycle with localStorage persistence
- `client/portlet/portlet.js` has postMessage handler
- `client/portlet/portlet.css` has chat and input styles

## ACs Covered

| AC | Description | TCs |
|----|-------------|-----|
| AC-5.2 | Agent connection status visible to user | Server lifecycle transitions automated in Story 2b; Story 6 UI rendering (`status dot`, input disable, reconnect button) validated via Gorilla checklist (manual) |
| AC-5.6 | Browser refresh restores session state | TC-5.6a |
| TC-2.2d | Claude Code session end-to-end | Manual/integration |
| TC-2.2e | Codex session end-to-end | Manual/integration |

Codex adapter note: adapter availability is a runtime concern, not a Story 6 readiness concern. Automated tests mock ACP at the process boundary; real Codex adapter validation is deferred to integration/Gorilla testing.

WebSocket integration tests:
- `project:add` round-trip
- `session:create` round-trip
- `session:send` streams response
- TC-3.7b: cancel round-trip
- `project:remove` WebSocket round-trip
- TC-2.2f: create failure sends error

## Files

### New Files

| File | Contents |
|------|----------|
| (No new test files -- tests added to existing files) | |

### Modified Files

| File | Changes |
|------|---------|
| `server/acp/agent-manager.ts` | Add Codex CLI command configuration |
| `client/shell/shell.js` | WebSocket reconnection logic with exponential backoff, resync on reconnect |
| `client/portlet/portlet.js` | Connection status indicator handling |
| `client/portlet/portlet.css` | Connection status dot styles |
| `client/shell/sidebar.js` | Reconnect button per CLI type when disconnected |
| `tests/server/websocket.test.ts` | +6 integration tests |
| `tests/client/tabs.test.ts` | +1 test (TC-5.6a) |

### Existing Files (unchanged, for reference)

| File | Role |
|------|------|
| `server/websocket.ts` | WebSocket message handler |
| `server/acp/acp-client.ts` | ACP JSON-RPC protocol |
| `server/acp/acp-types.ts` | ACP type definitions |
| `shared/types.ts` | ChatEntry, ClientMessage, ServerMessage |
| `client/shell/tabs.js` | Tab bar lifecycle |

## Test Breakdown

### `tests/server/websocket.test.ts` (+6 tests)

| TC | Test Name | Setup | Assert |
|----|-----------|-------|--------|
| -- | project:add round-trip | WS client sends project:add | Receives project:added with project data |
| -- | session:create round-trip | WS client sends session:create | Receives session:created with sessionId |
| -- | session:send streams response | WS client sends session:send | Receives session:update, session:chunk(s), session:complete |
| TC-3.7b | cancel round-trip | WS client sends session:send then session:cancel | Receives session:cancelled |
| -- | project:remove WebSocket round-trip | WS client sends project:remove | Receives project:removed |
| TC-2.2f | create failure sends error | Mock ACP fails on session:create | Receives error message |

### `tests/client/tabs.test.ts` (+1 test)

| TC | Test Name | Setup | Assert |
|----|-----------|-------|--------|
| TC-5.6a | Tabs restore after browser refresh | Set localStorage with tab state, reinitialize | Tabs restored from localStorage |

**Story 6 test count: 7**

| Phase | This Story | Cumulative |
|-------|-----------|------------|
| Previous (Stories 0-5) | -- | 71 |
| Story 6 | 7 | 79 (FINAL) |

## Prompts

| Prompt | Phase | Description |
|--------|-------|-------------|
| `prompt-6.1-skeleton-red.md` | Skeleton + Red | WebSocket integration test structure + status indicator stubs + 7 failing tests |
| `prompt-6.2-green.md` | Green | Full implementation: Codex config, status indicators, WS reconnection, integration tests pass |
| `prompt-6.R-verify.md` | Verify | FINAL: 79 tests pass, full traceability check, manual verification checklist |

## Exit Criteria

- 79 tests PASS total (72 previous + 7 new) -- FINAL MVP test count
- `bun run typecheck` passes with zero errors
- `bun run verify` passes
- `bun run verify-all` passes
- Codex CLI command configured in agent-manager.ts
- Connection status indicators visible in session header
- WebSocket reconnection with backoff on browser side
- Browser refresh recovers tabs from localStorage
- All WebSocket integration round-trips verified
- Manual verification checklist complete (15 items)
