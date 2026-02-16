# Story 4: Session Management

## Overview

Story 4 implements session CRUD, listing, persistence, and archive functionality. Sessions are the core content unit -- each represents a conversation with an AI agent in the context of a project directory. The critical architectural insight is that ACP has no `session/list` method, so session listing is entirely local. Liminal Builder owns all session metadata (titles, timestamps, project mappings, archived state), while ACP agents own conversation content (accessed via `session/load` replay).

This story implements the SessionManager class on the server (canonical ID management, title derivation, list assembly, archive) and extends the sidebar on the client (session list rendering, "New Session" button with CLI picker, archive action). SessionManager resolves project working directories through ProjectStore so `createSession` and `openSession` have a reliable `cwd` source.

**Contract note (source of truth):** SessionManager is `constructor(store, agentManager, projectStore)` and `createSession(projectId, cliType)`. Session listing remains local-only (no ACP join), and titles derive from the first user message.

## Prerequisites

- Working directory: `/Users/leemoore/code/liminal-builder`
- Story 0 complete (all stubs, types, HTML scaffolding exist)
- Story 1 complete (project sidebar functional, 9 tests pass)
- Story 2a complete (ACP client protocol layer, 9 tests; running total: 18)
- Story 2b complete (agent manager + WebSocket bridge, 10 tests; running total: 28)
- Story 3 complete (chat session UI, 45 tests pass)
- All 45 existing tests pass
- `bun run typecheck` passes

## ACs Covered

| AC | Description |
|----|-------------|
| AC-2.1 | Sessions for a project are listed in the sidebar, sorted by most recent activity |
| AC-2.2 | User can create a new session for a project |
| AC-2.3 | User can open an existing session |
| AC-2.4 | User can archive a session |
| AC-2.5 | Session data persists across app restart |

## Files

### Files Modified

| File | Changes |
|------|---------|
| `server/sessions/session-manager.ts` | Full implementation: CRUD, list assembly, canonical IDs, title derivation, archive, project path resolution via ProjectStore |
| `server/websocket.ts` | Preserve Story 2b routes; Story 4 adds `session:list` and `session:archive`, plus `session:title-updated` server-to-client emission |
| `client/shell/sidebar.js` | Session list rendering, "New Session" button, CLI picker, archive action |

### Test Files Created/Modified

| File | Tests |
|------|-------|
| `tests/server/session-manager.test.ts` | 10 tests (new file) |
| `tests/client/sidebar.test.ts` | +3 tests (added to existing file) |

## Test Breakdown

| Test File | # Tests | TCs Covered |
|-----------|---------|-------------|
| `tests/server/session-manager.test.ts` | 10 | TC-2.1a, TC-2.1b, TC-2.1c, TC-2.2a, TC-2.2f, TC-2.3a, TC-2.4a, TC-2.4c, TC-2.5a, TC-2.5b |
| `tests/client/sidebar.test.ts` | +3 | TC-2.2b, TC-2.2c, TC-2.4b |

## Deferred TCs

- TC-2.2d and TC-2.2e: Manual/Gorilla validation deferred to Story 6 integration.
- TC-2.3b: Deferred to Story 5 (tab deduplication behavior).

**Story 4 test count: 13**

| Cumulative | Tests |
|------------|-------|
| Story 0 | 0 |
| Story 1 | 9 |
| Story 2a | 18 |
| Story 2b | 28 |
| Story 3 | 45 |
| **Story 4** | **58** |

## Prompts

| Prompt | Phase | Description |
|--------|-------|-------------|
| `prompt-4.1-skeleton-red.md` | Skeleton + Red | SessionManager stubs with list assembly algorithm, 13 failing tests |
| `prompt-4.2-green.md` | Green | Full implementation: canonical IDs, title derivation, session open sequence |
| `prompt-4.R-verify.md` | Verify | All 58 tests pass, typecheck, smoke test checklist |

## Exit Criteria

- All tests pass: `bun run test && bun run test:client` (prior stories + 13 new)
- `bun run verify` passes
- `bun run typecheck` passes with zero errors
- Manual: can create new sessions, browse existing ones, open with full history, archive sessions
- Session list sorts by most recent activity
- Session titles derive from first user message
- Archived sessions hidden from sidebar
- Sessions survive app restart
