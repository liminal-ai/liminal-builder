# Prompt 4.2: Story 4 Green

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context.

## Context

**Product/Project/Feature:** Liminal Builder, Epic 02 Provider Architecture + Streaming Pipeline.

**Story:** Bring Story 4 to green for Claude provider behavior and normalization while preserving red-test contracts.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 4 red baseline exists.
- `TC-2.1b` is activated (no longer placeholder) in `provider-interface.test.ts`.
- Story 0 through Story 3 suites remain green.

## Reference Documents
(For human traceability only. Execution details are inlined.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-4-claude-provider/story.md`

## Inlined Implementation Contract

### Required Claude provider behavior
- `createSession` and `loadSession` maintain persistent provider-backed session semantics.
- `sendMessage` uses streaming input generator semantics and preserves sequential ordering.
- `cancelTurn` triggers SDK interrupt behavior for active turn.
- `killSession` tears down process/session state.
- `isAlive` truthfully reflects subprocess liveness.
- `onEvent` supports callback registration for canonical event emission.

### Deterministic normalization decisions
- Item IDs must use `${turnId}:${messageOrdinal}:${blockIndex}`.
- `item_start(function_call)` includes `name` + `callId`; finalized arguments are authoritative at `item_done(function_call)`.
- Reasoning/thinking content is emitted when available.
- Use streaming-capable default mode (no fixed `maxThinkingTokens` unless explicitly provided in session options).

### SDK -> canonical mapping table
| SDK signal | Canonical output |
|---|---|
| `message_start` | `response_start` (model/provider metadata present) |
| `content_block_start` text | `item_start` with `itemType: "message"` |
| `content_block_delta` text | `item_delta` |
| `content_block_stop` text | `item_done` with finalized message |
| `content_block_start` tool_use | `item_start` with `itemType: "function_call"`, `name`, `callId` |
| `content_block_delta` input_json_delta | `item_delta` argument fragments |
| `content_block_stop` tool_use | `item_done(function_call)` with finalized arguments |
| SDK user tool-result message | `item_done(function_call_output)` with original `callId` |
| `message_delta`/`message_stop` terminal metadata | `response_done` with `status`, `usage`, `finishReason` |
| SDK/generator/process fatal failure | `response_error` preferred; `response_done(status:"error", error)` supported |

### ProviderError usage expectations
- `SESSION_CREATE_FAILED`: invalid project dir / SDK setup failure during create.
- `SESSION_NOT_FOUND`: unknown session for send/cancel/kill/load.
- `PROCESS_CRASH`: subprocess unexpectedly exits or is unusable.
- `PROTOCOL_ERROR`: invalid/unsupported SDK event sequence.
- `INVALID_STREAM_EVENT`: event payload cannot be normalized to canonical contract.
- `INTERRUPT_FAILED`: cancel could not interrupt active turn.

### File responsibility boundary
- `claude-sdk-provider.ts`: session registry, lifecycle operations, input generator orchestration, process liveness.
- `claude-event-normalizer.ts`: event-to-envelope mapping, block correlation, deterministic item ID generation.

## Files to Modify
- `server/providers/claude/claude-sdk-provider.ts`
- `server/providers/claude/claude-event-normalizer.ts`

## Optional File (only if red contract is objectively wrong)
- `tests/server/providers/provider-interface.test.ts`
- `tests/server/providers/claude-sdk-provider.test.ts`

If this is needed, document the exact contract mismatch before editing tests.

## Non-Goals
- No Session API route/service contract changes.
- No provider-registry contract changes.
- No pipeline/websocket/browser migration work.
- No Codex provider changes.

## Constraints
- Do NOT modify tests in green unless there is a proven contract inconsistency.
- Do NOT add new dependencies.
- Do NOT modify files outside scoped list.
- Preserve red test intent and TC naming.
- Keep canonical error signaling wording consistent: `response_error` preferred, `response_done(status:"error", error)` supported.

## If Blocked or Uncertain
- If a test can only pass by weakening assertions, stop and report.
- If existing provider-type contracts conflict with this prompt, stop and report exact mismatch.
- Do NOT silently reinterpret lifecycle or mapping semantics.

## Verification
When complete:
1. Run `bun run green-verify`
2. Run `bun run test -- tests/server/providers/provider-interface.test.ts tests/server/providers/claude-sdk-provider.test.ts`

Expected:
- 14 Story 4 tests pass in `claude-sdk-provider.test.ts`.
- `TC-2.1b` passes as active conformance test.
- `TC-2.1c` remains placeholder/todo for Story 5.
- Running traceability total remains 60.
- Executable total after Story 4 is 59.

## Done When
- [ ] Story 4 scoped tests are green.
- [ ] `TC-2.1b` active conformance check is green.
- [ ] No unapproved test rewrites in green.
- [ ] `green-verify` passes.
- [ ] No out-of-scope files changed.

## Handoff Output Contract
Return:
- Files changed
- Story 4 test pass counts
- `TC-2.1b` status confirmation
- Any unresolved risks or deferred decisions
