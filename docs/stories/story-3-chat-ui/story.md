# Story 3: Chat Session UI

## Overview

Story 3 implements the chat interface inside the portlet iframe. This is the core user experience -- sending messages and receiving streaming responses from AI agents. The portlet runs inside an iframe and communicates with the shell via postMessage. It renders four types of chat entries (user, assistant, thinking, tool-call), handles streaming text with deferred markdown rendering, manages auto-scroll behavior, and provides cancel functionality.

The portlet maintains a local list of `ChatEntry` objects keyed by `entryId` and renders them as the conversation thread. During streaming, raw text is displayed; on completion, full markdown rendering is applied via `marked` + `DOMPurify`. Tool calls transition through running/complete/error states. Thinking blocks render with muted, collapsible styling.

Story 3 uses Story 2b's real agent pipeline for send/stream/cancel message routing, while keeping temporary/mock session management paths so the chat flow can run end-to-end before full session lifecycle plumbing lands in Story 4.

## Prerequisites

- Working directory: `/Users/leemoore/code/liminal-builder`
- Story 0 complete (all stubs, types, HTML scaffolding exist)
- Story 1 complete (project sidebar functional, 9 tests pass)
- Story 2a complete (ACP client protocol layer, 18 tests pass)
- Story 2b complete (agent manager + WebSocket bridge, 28 tests pass)
- All 28 existing tests pass
- `bun run typecheck` passes

## ACs Covered

| AC | Description |
|----|-------------|
| AC-3.1 | User messages display as distinct user turns in the chat |
| AC-3.2 | Agent responses stream into the chat as they arrive |
| AC-3.3 | Tool calls display inline with status |
| AC-3.4 | Agent thinking/reasoning blocks display distinctly |
| AC-3.5 | Input bar is always accessible at the bottom of the chat |
| AC-3.6 | Chat auto-scrolls to show latest content during streaming |
| AC-3.7 | User can cancel a running agent response |
| AC-5.4 | Starting a session shows progress feedback (launching indicator) |

## Files

### Files Modified

| File | Changes |
|------|---------|
| `server/websocket.ts` | Route `session:send`/`session:cancel`, stream back `session:update`/`session:chunk`/`session:complete` |
| `client/portlet/portlet.js` | Full postMessage handler, session state coordination |
| `client/portlet/chat.js` | Entry rendering by type, streaming, auto-scroll, markdown |
| `client/portlet/input.js` | Textarea, send/cancel, disabled state, working indicator |
| `client/shared/markdown.js` | marked + DOMPurify + highlight.js pipeline |

### Test Files Created

| File | Tests |
|------|-------|
| `tests/client/chat.test.ts` | 9 tests |
| `tests/client/input.test.ts` | 5 tests |
| `tests/client/portlet.test.ts` | 3 tests |

## Test Breakdown

| Test File | # Tests | TCs Covered |
|-----------|---------|-------------|
| `tests/client/chat.test.ts` | 9 | TC-3.2a, TC-3.2b, TC-3.3a, TC-3.3b, TC-3.3c, TC-3.4a, TC-3.6a, TC-3.6b, TC-3.6c |
| `tests/client/input.test.ts` | 5 | TC-3.1b, TC-3.5a, TC-3.5b, TC-3.7a, TC-3.7c |
| `tests/client/portlet.test.ts` | 3 | TC-3.1a, TC-5.4a, TC-3.7b |

**Story 3 test count: 17**

**Deferred / Cross-Story Coverage Notes**

- `session:history` handling is implemented in Story 3 portlet logic and verified in Story 4 session-open coverage.
- Story 3 introduces `server/websocket.ts` bridge changes, but adds no new server test files; regression coverage is provided by existing Stories 2a/2b server test suites and Story 3 verification checks.

| Cumulative | Tests |
|------------|-------|
| Story 0 | 0 |
| Story 1 | 9 |
| Story 2a | 18 |
| Story 2b | 28 |
| **Story 3** | **45** |

## Prompts

| Prompt | Phase | Description |
|--------|-------|-------------|
| `prompt-3.1-skeleton-red.md` | Skeleton + Red | Portlet/chat/input stubs with postMessage handler structure, 17 failing tests |
| `prompt-3.2-green.md` | Green | Full implementation: websocket routing, rendering, streaming, markdown, auto-scroll, cancel |
| `prompt-3.R-verify.md` | Verify | All 45 tests pass, typecheck, smoke test checklist |

## Exit Criteria

- 45 tests pass (28 prior + 17 new)
- `bun run verify` passes
- `bun run typecheck` passes with zero errors
- Manual: can chat with Claude Code through the app
- Streaming responses render incrementally
- Tool calls show running/complete/error states
- Thinking blocks have distinct muted styling
- Auto-scroll works during streaming, pauses on scroll up
- Cancel stops response and re-enables input
