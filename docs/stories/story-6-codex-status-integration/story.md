# Story 6: Codex CLI + Connection Status + Integration

## Overview

Story 6 is the final story of the Liminal Builder MVP. It adds three capabilities and provides end-to-end integration validation:

1. **Codex CLI support** -- Add Codex as a second CLI type in the agent manager with its command configuration, completing the dual-CLI design.
2. **Connection status indicators** -- Visual status dots in the session header and sidebar showing agent connection state (connected/disconnected/reconnecting), plus a reconnect button per CLI type when disconnected.
3. **Browser refresh recovery** -- WebSocket reconnection with exponential backoff on the browser side, plus localStorage-based tab restoration on refresh. Agent processes survive browser refresh because they are server-managed.
4. **WebSocket integration tests** -- Full round-trip tests verifying the message pipeline from WebSocket client through server to mocked ACP and back.

This story brings the total test count to 78, completing the MVP test suite.

## Prerequisites

- Stories 0-5 complete: 71 tests passing
- Working directory: `/Users/leemoore/code/liminal-builder`
- `server/acp/agent-manager.ts` has AgentManager with lifecycle state machine
- `client/shell/shell.js` has WebSocket connection
- `client/shell/tabs.js` has full tab lifecycle with localStorage persistence
- `client/portlet/portlet.js` has postMessage handler
- `client/portlet/portlet.css` has chat and input styles

## ACs Covered

| AC | Description | TCs |
|----|-------------|-----|
| AC-5.2 | Agent connection status visible to user | (Status indicators implemented; TC-5.2a-d tested in Story 2b) |
| AC-5.6 | Browser refresh restores session state | TC-5.6a |
| TC-2.2d | Claude Code session end-to-end | Manual/integration |
| TC-2.2e | Codex session end-to-end | Manual/integration |

WebSocket integration tests:
- `project:add` round-trip
- `session:create` round-trip
- `session:send` streams response
- TC-3.7b: cancel round-trip
- TC-1.3b: remove project closes tabs
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
| TC-1.3b | remove project closes tabs | WS client sends project:remove for project with tabs | Receives project:removed |
| TC-2.2f | create failure sends error | Mock ACP fails on session:create | Receives error message |

### `tests/client/tabs.test.ts` (+1 test)

| TC | Test Name | Setup | Assert |
|----|-----------|-------|--------|
| TC-5.6a | Tabs restore after browser refresh | Set localStorage with tab state, reinitialize | Tabs restored from localStorage |

**Story 6 test count: 7**

| Phase | This Story | Cumulative |
|-------|-----------|------------|
| Previous (Stories 0-5) | -- | 71 |
| Story 6 | 7 | 78 (FINAL) |

## Prompts

| Prompt | Phase | Description |
|--------|-------|-------------|
| `prompt-6.1-skeleton-red.md` | Skeleton + Red | WebSocket integration test structure + status indicator stubs + 7 failing tests |
| `prompt-6.2-green.md` | Green | Full implementation: Codex config, status indicators, WS reconnection, integration tests pass |
| `prompt-6.R-verify.md` | Verify | FINAL: 78 tests pass, full traceability check, manual verification checklist |

## Exit Criteria

- 78 tests PASS total (71 previous + 7 new) -- FINAL MVP test count
- `bun run typecheck` passes with zero errors
- Codex CLI command configured in agent-manager.ts
- Connection status indicators visible in session header
- WebSocket reconnection with backoff on browser side
- Browser refresh recovers tabs from localStorage
- All WebSocket integration round-trips verified
- Manual verification checklist complete (15 items)
