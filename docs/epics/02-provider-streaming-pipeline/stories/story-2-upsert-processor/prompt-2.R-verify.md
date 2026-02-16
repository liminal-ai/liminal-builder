# Prompt 2.R: Story 2 Verification

## Context

You are auditing Story 2 for AC/TC traceability, algorithm correctness, regression safety, and scope discipline.
Note: this is Story 2 in the sharded execution plan (the epic's recommended breakdown labels this as Story 1 before sharding).
These gates are the minimum; also look for unexpected regressions or mismatches with spec/contract beyond this list.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Approved Contract-Correction Exception

During post-Green critical review, two contract-level gaps were identified and approved for correction:
- `response_done(status="error")` needed structured error support (`response_done.error`) with processor precedence `response_error.error -> response_done.error -> compatibility fallback`.
- Tool-call `create` emissions needed explicit contract language that `toolArguments` can be partial/empty before `item_done(function_call)`.

These were treated as contract corrections (not assertion weakening), and the user explicitly approved updating test files during this Green-phase window.

Approved test-file updates:
- `tests/fixtures/stream-events.ts`
- `tests/server/contracts/stream-contracts.test.ts`
- `tests/server/streaming/upsert-stream-processor.test.ts`

## Reference Documents
(For human traceability; audit criteria are inlined.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`

## Verification Checklist

### 1) Test inventory and counts
- Confirm Story 2 suite exists at:
  - `tests/server/streaming/upsert-stream-processor.test.ts`
- Confirm exactly 18 Story 2 TC-traceability tests exist.
- Confirm running traceability total remains 32 (Story 1: 14 + Story 2: 18).
- Confirm Story 1 executable tests remain passing (`12` executable), with `2` placeholders still deferred (TC-2.1b/c).

### 2) TC-by-TC behavioral audit
- `TC-5.1a`: create + complete emitted for simple message lifecycle.
- `TC-5.1b`: all message emissions carry full accumulated content.
- `TC-5.1c`: tool invocation create + completion complete only; no extra emissions; create-time tool arguments may be partial/empty.
- `TC-5.1d`: reasoning maps to `thinking` upserts.
- `TC-5.2a`: early thresholds emit frequently.
- `TC-5.2b`: later thresholds emit less frequently.
- `TC-5.2c`: strict `>` threshold semantics.
- `TC-5.2d`: one large delta crossing multiple thresholds emits once.
- `TC-5.2e`: final gradient value repeats after exhaustion.
- `TC-5.2f`: defaults are `[10, 20, 40, 80, 120]`.
- `TC-5.3a`: callId correlation maps output to original invocation itemId.
- `TC-5.3b`: concurrent/interleaved tool calls remain independently correlated.
- `TC-5.4a`: destroy flushes buffered content with `status: "error"`.
- `TC-5.4b`: timeout flush emits after configured idle period.
- `TC-5.4c`: empty item start->done emits single empty complete upsert.
- `TC-5.4d`: cancelled items are discarded with no item upsert emission.
- `TC-5.4e`: turn cancellation appears at turn lifecycle level without item mislabeling.
- `TC-5.4f`: failure emits `turn_error`; no `turn_complete(error)`; terminal error details prioritize `response_error.error` then `response_done.error`.

### 3) Algorithm and contract checks
- Processor emits only via `onUpsert` and `onTurn` callbacks.
- Token counting used by gradient assertions is deterministic and consistent with Story 2 rule (non-empty whitespace-delimited segment count).
- `sourceTimestamp` originates from stream event timestamp; `emittedAt` originates from processor clock/dependency.

### 4) Regression and scope checks
- Story 1 contract tests still pass (with placeholders unchanged).
- No provider/session/route/websocket/browser code was modified in Story 2.
- Test-file modifications are allowed only for the approved contract-correction set above; fail verification if any other Story 1/2 test edits are present.

## Commands
- `bun run green-verify` (note: `guard:no-test-changes` may fail due the approved test-file exception above)
- `bun run test -- tests/server/contracts/stream-contracts.test.ts tests/server/providers/provider-interface.test.ts tests/server/streaming/upsert-stream-processor.test.ts`
- `git status --porcelain`

## Verification Output Format
Return results in this compact structure:
1. `Summary`
2. `Counts`
   - Story 2 tests: `<passed>/<total>`
   - Story 1 executable tests: `<passed>/12`
   - Story 1 placeholders: `2 deferred (TC-2.1b/c)`
3. `TC Audit`
   - List each TC-5.1a..TC-5.4f as `PASS` or `FAIL` with one-line evidence.
4. `Regressions`
   - `None` or explicit list with file and reason.
5. `Scope Check`
   - Confirm whether any out-of-scope files changed.
   - Explicitly confirm test-file edits are only the approved contract-correction files.

## If Blocked or Uncertain
- If test count or TC mapping does not align with this checklist, fail verification and report exact mismatch.
- If any green test passes by weakening assertions instead of meeting contract behavior, fail verification.

## Done When
- [ ] Story 2 is green with all 18 TC behaviors verified.
- [ ] Story 1 tests are not regressed.
- [ ] Processor contract and terminal semantics match Story 2 requirements.
- [ ] No unapproved scope expansion is present.
