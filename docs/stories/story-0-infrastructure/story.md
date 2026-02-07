# Story 0: Infrastructure & Project Skeleton

## Overview

Story 0 establishes the foundational infrastructure for Liminal Builder. It creates all TypeScript type definitions, error classes, test fixtures, the JSON store implementation, the Fastify server entry point with static file serving and WebSocket endpoint, and all client HTML/JS/CSS stubs. No tests are written in this story -- it is pure scaffolding.

This story has NO TDD cycle. There is no Red phase or Green phase. The work is split into a single setup prompt and a verification prompt.

## Prerequisites

- Working directory: `/Users/leemoore/code/liminal-builder`
- Bun runtime installed
- No existing `src/`, `server/`, `client/`, or `tests/` directories

## ACs Covered

None directly. This is infrastructure-only. It enables all subsequent stories.

## Files Created

### Server

| File | Contents |
|------|----------|
| `server/errors.ts` | `NotImplementedError`, `AppError` error classes |
| `server/projects/project-types.ts` | `Project` interface |
| `server/sessions/session-types.ts` | `SessionMeta`, `SessionListItem`, `CliType` |
| `server/acp/acp-types.ts` | JSON-RPC types, ACP event/result types |
| `server/store/store-types.ts` | `StoreConfig`, `VersionedFile<T>` |
| `server/store/json-store.ts` | Generic JSON file persistence (full implementation) |
| `server/index.ts` | Fastify entry, static serving, WebSocket plugin |
| `server/websocket.ts` | WebSocket connection handler, message router stubs |
| `server/projects/project-store.ts` | ProjectStore class with CRUD stubs |
| `server/sessions/session-manager.ts` | SessionManager class with method stubs |
| `server/acp/agent-manager.ts` | AgentManager class with lifecycle stubs |
| `server/acp/acp-client.ts` | AcpClient class with protocol stubs |

### Client

| File | Contents |
|------|----------|
| `client/shell/index.html` | Shell page: sidebar, tab bar, portlet container |
| `client/shell/shell.js` | WebSocket connection setup |
| `client/shell/sidebar.js` | Sidebar render placeholder |
| `client/shell/tabs.js` | Tab bar render placeholder |
| `client/shell/shell.css` | Layout grid styles |
| `client/portlet/index.html` | Portlet page: chat container, input bar |
| `client/portlet/portlet.js` | postMessage handler stub |
| `client/portlet/chat.js` | Chat render stub |
| `client/portlet/input.js` | Input bar stub |
| `client/portlet/portlet.css` | Chat + input styles |
| `client/shared/theme.css` | Tokyo Night CSS custom properties |
| `client/shared/markdown.js` | marked + DOMPurify setup |
| `client/shared/constants.js` | CLI types, status values |

### Shared

| File | Contents |
|------|----------|
| `shared/types.ts` | ChatEntry discriminated union, ClientMessage, ServerMessage |

### Test Fixtures

| File | Contents |
|------|----------|
| `tests/fixtures/projects.ts` | Mock project data |
| `tests/fixtures/sessions.ts` | Mock session data |
| `tests/fixtures/acp-messages.ts` | Mock ACP JSON-RPC responses |

### Config

| File | Contents |
|------|----------|
| `package.json` | Dependencies, scripts |
| `tsconfig.json` | Bun TypeScript config |

## Test Breakdown

| Test File | # Tests | Running Total |
|-----------|---------|---------------|
| (none) | 0 | 0 |

**Story 0 test count: 0**

## Prompts

| Prompt | Phase | Description |
|--------|-------|-------------|
| `prompt-0.1-setup.md` | Setup | Create all files, install deps, configure project |
| `prompt-0.R-verify.md` | Verify | Run verification scripts, server start, WebSocket connect |

## Exit Criteria

- `bun run verify` passes (format:check + lint + typecheck + service mock tests)
- `bun run dev` starts the server and serves shell HTML at `http://localhost:3000`
- WebSocket connects when shell page loads in browser
- `bun run verify-all` is available and runs `verify` + integration + e2e hooks
- All stub methods throw `NotImplementedError`
