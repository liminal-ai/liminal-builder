# Prompt 2.1: Story 2 Skeleton + Red

## Context

**Product:** Liminal Builder is an agentic IDE that wraps AI coding CLIs (Claude Code, Codex) in a Fastify + WebSocket server with a browser-based chat UI.

**Project:** Epic 02 replaces the ACP-centric path with provider normalization -> upsert processing -> delivery. This story implements the upsert processor layer.

**Feature:** Provider Architecture + Streaming Pipeline.

**Story:** Story 2 implements `upsert-stream-processor.ts` and its service-mock test suite. Scope is AC-5.1..AC-5.4 only.
Note: this is Story 2 in the sharded execution plan (the epic's recommended breakdown labels this as Story 1 before sharding).

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 0 infrastructure is green.
- Story 1 contracts are green for executable scope.
- The following files already exist:
  - `server/streaming/stream-event-schema.ts`
  - `server/streaming/upsert-types.ts`
  - `tests/fixtures/stream-events.ts`
  - `tests/fixtures/upserts.ts`
  - `tests/helpers/stream-assertions.ts`

## Reference Documents
(For human traceability; all execution content is inlined below.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md` (AC-5.x)
- `docs/epics/02-provider-streaming-pipeline/tech-design.md` (Chunk 1)
- `docs/epics/02-provider-streaming-pipeline/test-plan.md` (TC-5.x)
- `docs/epics/02-provider-streaming-pipeline/stories/story-1-contracts/story.md`

## Inlined Contract Snapshot

### Processor surface
- Input: `StreamEventEnvelope`
- Outputs: callback emissions only
  - `onUpsert(upsert: UpsertObject)`
  - `onTurn(event: TurnEvent)`
- Required methods:
  - `process(event: StreamEventEnvelope): void`
  - `destroy(reason?: { code: string; message: string }): void`

### Upsert semantics
- Emissions carry full accumulated content, not delta-only fragments.
- Message lifecycle emits `create` first, `update` for intermediate gradient-triggered emissions, `complete` at terminal.
- Tool call lifecycle emits two upserts total:
  - invocation `create` (tool arguments may be partial/empty at create time)
  - completion `complete` (correlated by `callId` to original invocation `itemId`)
- Reasoning maps to upsert `type: "thinking"`.

### Turn lifecycle semantics
- `response_start` -> `turn_started`
- `response_done.status: "completed" | "cancelled"` -> `turn_complete`
- `response_done.status: "error"` (prefer structured `error` details) or `response_error` -> `turn_error`
- Error terminal states must never emit `turn_complete` with error status.

### Batching semantics
- Default gradient: `[10, 20, 40, 80, 120]`
- Threshold rule is strict `>` (equal threshold does not emit)
- Large delta crossing multiple thresholds emits once and advances batch index accordingly
- After gradient exhaustion, repeat final threshold (`120`) forever
- Idle timeout default is `1000ms` and forces buffered emission
- `destroy()` flushes buffered content with upsert `status: "error"` and error metadata

### Deterministic token counting rule for Story 2 tests
Use a deterministic story-local token counter: count non-empty whitespace-delimited segments in accumulated textual content.

Reference implementation for tests:
```ts
function countBatchTokens(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}
```

This rule is required for repeatable TC-5.2 assertions in this story.

## TCs In Scope
- TC-5.1a..TC-5.1d
- TC-5.2a..TC-5.2f
- TC-5.3a..TC-5.3b
- TC-5.4a..TC-5.4f

## TC Expectation Map (must be encoded in tests)
- `TC-5.1a`: simple text lifecycle emits create then complete with accumulated content.
- `TC-5.1b`: intermediate emissions contain full accumulated text.
- `TC-5.1c`: tool call emits invocation create (arguments may be partial/empty) and correlated completion complete only.
- `TC-5.1d`: reasoning events emit `thinking` upserts.
- `TC-5.2a`: early small thresholds emit frequently.
- `TC-5.2b`: later thresholds emit less frequently.
- `TC-5.2c`: strict `>` threshold behavior enforced.
- `TC-5.2d`: one large delta crossing multiple thresholds emits once, index advances.
- `TC-5.2e`: final gradient value repeats indefinitely after exhaustion.
- `TC-5.2f`: defaults initialize as `[10, 20, 40, 80, 120]`.
- `TC-5.3a`: function_call_output correlates to original invocation item by `callId`.
- `TC-5.3b`: interleaved concurrent tool calls stay independently correlated.
- `TC-5.4a`: destroy mid-stream flushes buffered content as upsert `error`, never `complete`.
- `TC-5.4b`: timeout flush emits buffered content after configured delay.
- `TC-5.4c`: empty start->done emits one complete upsert with empty content.
- `TC-5.4d`: cancelled items are discarded with no item upsert emission.
- `TC-5.4e`: turn cancellation represented at turn lifecycle level without mislabeling items.
- `TC-5.4f`: failed turns emit `turn_error`; no `turn_complete(error)`.

## Available Fixtures and Helpers
Reuse existing assets before creating new fixtures:
- `tests/fixtures/stream-events.ts`
  - `createEnvelope(...)`
  - response/item lifecycle fixtures
- `tests/fixtures/upserts.ts`
  - message/thinking/tool_call upsert fixtures
  - `TURN_STARTED_EVENT`, `TURN_COMPLETE_EVENT`, `TURN_ERROR_EVENT`
- `tests/helpers/stream-assertions.ts`
  - `assertUpsertShape(...)`
  - envelope validation/correlation assertions

## Task

### Files to Create/Modify
- `server/streaming/upsert-stream-processor.ts`
- `tests/server/streaming/upsert-stream-processor.test.ts`

### Red-phase implementation requirements
1. Create processor skeleton exporting an object/class that implements:
   - `process(event: StreamEventEnvelope): void`
   - `destroy(reason?: { code: string; message: string }): void`
2. Stub unimplemented behavior paths with `NotImplementedError` from `server/errors.ts` as needed.
3. Add 18 Story 2 tests with explicit TC IDs in test names/comments matching the expectation map above.
4. Keep tests at service-mock boundary (no real provider/subprocess/network).
5. For timeout-driven tests (especially `TC-5.4b`), use fake timers to keep tests deterministic and avoid flakiness.

## Constraints
- Do NOT implement providers, routes, websocket delivery, or browser rendering.
- Do NOT modify files outside the list above.
- Keep red phase intentionally failing for unimplemented behavior contracts.

## If Blocked or Uncertain
- If contracts in Story 0/1 conflict with this prompt, stop and surface the exact mismatch.
- If a TC cannot be encoded without widening scope, stop and ask.
- If deterministic token counting semantics are disputed, stop and ask before changing the rule.
- Do NOT silently resolve ambiguity.

## Verification
When complete:
1. Run `bun run red-verify`
2. Run `bun run test -- tests/server/streaming/upsert-stream-processor.test.ts`
3. Run `bun run guard:test-baseline-record`

Expected:
- `red-verify` passes.
- Story 2 test suite exists with exactly 18 TC-traceability tests.
- Story 2 tests are red/failing due to unimplemented behavior.
- Red baseline is recorded.

## Done When
- [ ] Processor skeleton exists with required API.
- [ ] 18 TC-traceability tests exist for Story 2.
- [ ] Story 2 suite is red as expected.
- [ ] `bun run red-verify` passes.
- [ ] `bun run guard:test-baseline-record` completes.
