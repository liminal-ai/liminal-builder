# Story 1: Project Sidebar

## Overview

Story 1 implements project directory management -- the first user-facing feature of Liminal Builder. It covers adding projects to the sidebar, removing them, displaying them in insertion order, showing an empty state on first run, and collapsing/expanding project folders. All project operations flow through WebSocket: the client sends a request, the server validates and persists, then confirms via response message.

This story follows a strict TDD cycle: Red (write failing tests against stubs) then Green (implement to make tests pass).

## Prerequisites

- Story 0 complete: all infrastructure files exist, `bun run typecheck` passes, server starts
- Key files that must exist from Story 0:
  - `server/errors.ts` (NotImplementedError, AppError)
  - `server/store/json-store.ts` (full implementation)
  - `server/store/store-types.ts`
  - `server/projects/project-types.ts` (Project interface)
  - `server/projects/project-store.ts` (stubs)
  - `server/websocket.ts` (stub)
  - `shared/types.ts` (ClientMessage, ServerMessage)
  - `client/shell/shell.js`, `client/shell/sidebar.js` (stubs)
  - `client/shared/constants.js`
  - `tests/fixtures/projects.ts`

## ACs Covered

| AC | Description |
|----|-------------|
| AC-1.1 | Sidebar displays all configured project directories as collapsible groups |
| AC-1.2 | User can add a project directory to the sidebar |
| AC-1.3 | User can remove a project from the sidebar |
| AC-1.4 | Project folders are collapsible |

## Files

### New Files

| File | Purpose |
|------|---------|
| `tests/server/project-store.test.ts` | 5 server-side tests for ProjectStore |
| `tests/client/sidebar.test.ts` | 4 client-side tests for sidebar rendering |

### Modified Files

| File | Changes |
|------|---------|
| `server/projects/project-store.ts` | Full CRUD implementation (replace stubs) |
| `server/websocket.ts` | Add `project:add`, `project:remove`, `project:list` handlers |
| `client/shell/sidebar.js` | Full sidebar rendering, add/remove/collapse |
| `client/shell/shell.css` | Project/session list styles |

## Test Breakdown

### `tests/server/project-store.test.ts` -- 5 tests

| TC | Test Name | Description |
|----|-----------|-------------|
| TC-1.1a | TC-1.1a: projects returned in insertion order | Add A then B, list returns [A, B] |
| TC-1.2a | TC-1.2a: add valid directory creates project | Mock path exists, project returned with ID |
| TC-1.2b | TC-1.2b: add nonexistent directory throws | Mock path not exists, validation error |
| TC-1.2d | TC-1.2d: add duplicate directory throws | Add same path twice, duplicate error |
| TC-1.3a | TC-1.3a: remove project retains session mappings | Remove project, session data unaffected |

### `tests/client/sidebar.test.ts` -- 4 tests

| TC | Test Name | Description |
|----|-----------|-------------|
| TC-1.1b | TC-1.1b: empty state prompt rendered | No projects, empty state visible |
| TC-1.2c | TC-1.2c: cancel add project sends no message | Open dialog, cancel, no WS message |
| TC-1.4a | TC-1.4a: collapse hides sessions | Click collapse, sessions hidden in DOM |
| TC-1.4b | TC-1.4b: collapse state persists in localStorage | Set collapsed, reload, still collapsed |

### Running Totals

| Story | Tests Added | Running Total |
|-------|-------------|---------------|
| Story 0 | 0 | 0 |
| Story 1 | 9 | 9 |

## Prompts

| Prompt | Phase | Description |
|--------|-------|-------------|
| `prompt-1.1-skeleton-red.md` | TDD Red | Write 9 tests. All ERROR (NotImplementedError). |
| `prompt-1.2-green.md` | TDD Green | Implement ProjectStore, WS handlers, sidebar. 9 tests PASS. |
| `prompt-1.R-verify.md` | Verify | All tests pass, typecheck passes, manual smoke test. |

## Exit Criteria

- 9 tests PASS (`bun test`)
- `bun run typecheck` passes with zero errors
- Manual: can add/remove projects in browser, collapse/expand works, state persists
