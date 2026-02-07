# Story 3: Chat Session UI

## Overview

Story 3 implements the chat interface inside the portlet iframe. This is the core user experience -- sending messages and receiving streaming responses from AI agents. The portlet runs inside an iframe and communicates with the shell via postMessage. It renders four types of chat entries (user, assistant, thinking, tool-call), handles streaming text with deferred markdown rendering, manages auto-scroll behavior, and provides cancel functionality.

The portlet maintains a local list of `ChatEntry` objects keyed by `entryId` and renders them as the conversation thread. During streaming, raw text is displayed; on completion, full markdown rendering is applied via `marked` + `DOMPurify`. Tool calls transition through running/complete/error states. Thinking blocks render with muted, collapsible styling.

## Prerequisites

- Working directory: `/Users/leemoore/code/liminal-builder`
- Story 0 complete (all stubs, types, HTML scaffolding exist)
- Story 1 complete (project sidebar functional, 9 tests pass)
- Story 2a complete (ACP client protocol layer, 17 tests pass)
- Story 2b complete (agent manager + WebSocket bridge, 27 tests pass)
- All 27 existing tests pass
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

| Cumulative | Tests |
|------------|-------|
| Story 0 | 0 |
| Story 1 | 9 |
| Story 2a | 17 |
| Story 2b | 27 |
| **Story 3** | **44** |

## Prompts

| Prompt | Phase | Description |
|--------|-------|-------------|
| `prompt-3.1-skeleton-red.md` | Skeleton + Red | Portlet/chat/input stubs with postMessage handler structure, 17 failing tests |
| `prompt-3.2-green.md` | Green | Full implementation: rendering, streaming, markdown, auto-scroll, cancel |
| `prompt-3.R-verify.md` | Verify | All 44 tests pass, typecheck, smoke test checklist |

## Exit Criteria

- 44 tests pass (27 prior + 17 new)
- `bun run typecheck` passes with zero errors
- Manual: can chat with Claude Code through the app
- Streaming responses render incrementally
- Tool calls show running/complete/error states
- Thinking blocks have distinct muted styling
- Auto-scroll works during streaming, pauses on scroll up
- Cancel stops response and re-enables input
