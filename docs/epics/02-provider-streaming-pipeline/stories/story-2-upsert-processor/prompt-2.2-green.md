# Prompt 2.2: Story 2 Green

## Context

**Product/Project/Feature:** Liminal Builder, Epic 02 Provider Streaming Pipeline.

**Story:** Implement Story 2 upsert processor behavior to satisfy AC-5.1..AC-5.4 using the existing Story 2 red tests as the behavioral contract.
Note: this is Story 2 in the sharded execution plan (the epic's recommended breakdown labels this as Story 1 before sharding).

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 2 red phase is complete.
- Story 2 red baseline was recorded.
- Story 0/1 contracts remain unchanged.

## Reference Documents
(For human traceability; execution content is inlined.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- Local prior-art reference:
  - `/Users/leemoore/code/codex-port-02/cody-fastify/src/core/upsert-stream-processor/processor.ts`
  - `/Users/leemoore/code/codex-port-02/cody-fastify/src/core/upsert-stream-processor/content-buffer.ts`
  - `/Users/leemoore/code/codex-port-02/cody-fastify/src/core/upsert-stream-processor/__tests__/processor.test.ts`
  - `/Users/leemoore/code/codex-port-02/cody-fastify/src/core/upsert-stream-processor/__tests__/fixtures/`

## Inlined Implementation Contract

### Prior-art guidance (supplemental, not required for execution)
- This processor is a port of cody-fastify prior art per epic assumption A4.
- Prior-art location in this environment:
  - `/Users/leemoore/code/codex-port-02/cody-fastify/src/core/upsert-stream-processor/`
- Precedence rule: if prior-art behavior conflicts with this prompt or Story 2 tests, follow this prompt and Story 2 tests.
- Preserve these behavior patterns:
  - gradient-based emission cadence
  - tool call correlation by `callId`
  - terminal flush/error semantics on destroy

### Required processor API
- `process(event: StreamEventEnvelope): void`
- `destroy(reason?: { code: string; message: string }): void`
- Emissions only via dependencies:
  - `onUpsert(upsert: UpsertObject)`
  - `onTurn(event: TurnEvent)`

### Required behavior
- Convert canonical stream events into accumulated upsert objects and turn lifecycle events.
- Upserts must contain full accumulated content at each emission. Intermediate gradient-triggered emissions use `status: "update"` (between initial `create` and terminal `complete`).
- Tool invocation `create` emissions may have partial/empty `toolArguments`; finalized invocation arguments are authoritative at `item_done(function_call)`.
- Tool call correlation must map `function_call_output.callId` back to original invocation `itemId`.
- Terminal error rule: emit `turn_error` and never `turn_complete(error)`; resolve error details by precedence `response_error.error` -> `response_done.error` -> compatibility fallback.

### Batching and timing rules
- Defaults: `batchGradientTokens = [10, 20, 40, 80, 120]`, `batchTimeoutMs = 1000`.
- Threshold is strict `>`.
- Single large delta crossing multiple thresholds emits once and advances batch index to the crossed level.
- After gradient entries are exhausted, continue using `120`.
- Timeout flushes buffered content.
- `destroy()` flushes buffered content with upsert `status: "error"`.
- Use the injected clock dependency (`deps.now`) for `emittedAt`; do not use wall-clock calls directly in processor logic.

### Deterministic token counting rule for this story
For gradient threshold checks in Story 2 behavior/tests, use non-empty whitespace-delimited segment count:
```ts
function countBatchTokens(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}
```

### TC groups to satisfy
- Content conversion: `TC-5.1a..TC-5.1d`
- Gradient semantics: `TC-5.2a..TC-5.2f`
- Tool correlation: `TC-5.3a..TC-5.3b`
- Edge/terminal behavior: `TC-5.4a..TC-5.4f`

## Files to Modify
- `server/streaming/upsert-stream-processor.ts`

## Optional File (only with explicit justification)
- `tests/server/streaming/upsert-stream-processor.test.ts`
  - Only if a red test expectation is objectively inconsistent with the inlined contract above.
  - If this is needed, document the mismatch before editing.

## Constraints
- Do NOT implement provider/session/route/websocket/browser code.
- Do NOT modify files outside the list.
- Treat `/Users/leemoore/code/codex-port-02/cody-fastify/` as read-only reference only; do not modify it.
- Do NOT weaken test assertions to make Green pass.
- Preserve Story 1 placeholder strategy (TC-2.1b/c remain placeholders in Story 1).

## If Blocked or Uncertain
- If Green requires changing tests for reasons other than contract mismatch, stop and report.
- If any TC behavior cannot be implemented without scope expansion, stop and report exact blocker.
- Do NOT silently alter contract semantics.

## Verification
When complete:
1. Run `bun run green-verify`
2. Run:
   `bun run test -- tests/server/contracts/stream-contracts.test.ts tests/server/providers/provider-interface.test.ts tests/server/streaming/upsert-stream-processor.test.ts`

Expected:
- Story 2: 18 tests pass.
- Story 1 executable tests remain passing (`12` executable), and placeholders remain deferred (`2` placeholders: TC-2.1b/c).
- Running traceability total remains 32 (Story 1: 14 + Story 2: 18).

## Done When
- [ ] Story 2 processor behavior is green for all 18 TCs.
- [ ] Story 1 contract tests are not regressed.
- [ ] `green-verify` passes.
- [ ] No out-of-scope files were changed.
