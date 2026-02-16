# Prompt 4.R: Story 4 Verification

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context operating as an auditor.

## Context
Audit Story 4 for AC/TC traceability, normalization fidelity, lifecycle correctness, and regression safety.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Reference Documents
(For traceability.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-4-claude-provider/story.md`

## Verification Checklist

### 1) File and scope audit
- Confirm Story 4 changes are limited to:
  - `server/providers/claude/claude-sdk-provider.ts`
  - `server/providers/claude/claude-event-normalizer.ts`
  - `tests/server/providers/claude-sdk-provider.test.ts`
  - `tests/server/providers/provider-interface.test.ts` (for `TC-2.1b` activation only)
- Fail verification if out-of-scope files are modified without explicit justification.

### 2) Test inventory and counts
- Confirm `tests/server/providers/claude-sdk-provider.test.ts` contains exactly 14 Story 4 tests with TC IDs in names.
- Confirm `tests/server/providers/provider-interface.test.ts` has:
  - active/passable `TC-2.1b`
  - deferred placeholder `TC-2.1c` for Story 5
- Running traceability total remains 60.

### 3) TC coverage audit
- `TC-2.1b` provider conformance is active and passing.
- `TC-3.1a..TC-3.1c` lifecycle create/load/error-on-create checks are represented.
- `TC-3.2a..TC-3.2b` streaming input and sequential ordering checks are represented.
- `TC-3.3a..TC-3.3f` normalization for message/tool/reasoning/multi-block/terminal metadata is represented.
- `TC-3.4a..TC-3.4c` cancel/kill/isAlive behavior is represented.

### 4) Normalization fidelity checks
- Item IDs follow `${turnId}:${messageOrdinal}:${blockIndex}`.
- Function-call starts include required `name` and `callId`.
- Tool-call completion uses finalized arguments at `item_done(function_call)`.
- Tool results map to `function_call_output` with original `callId`.
- Terminal errors are normalized using `response_error` preferred, with support for `response_done(status:"error", error)`.

### 5) Error and lifecycle correctness checks
- Provider failures surface typed `ProviderError` codes.
- `cancelTurn` routes through interrupt path and does not masquerade as successful completion.
- `killSession` reliably marks session/process dead.
- `onEvent` behavior remains contract-compliant for callback delivery.

### 6) Regression and immutability checks
- Confirm no regressions in Story 1-3 test suites.
- Confirm green phase did not rewrite Story 4 tests except approved contract corrections.

## Commands
1. `bun run green-verify`
2. `bun run test -- tests/server/contracts/stream-contracts.test.ts tests/server/providers/provider-interface.test.ts tests/server/streaming/upsert-stream-processor.test.ts tests/server/providers/provider-registry.test.ts tests/server/api/session-routes.test.ts tests/server/providers/claude-sdk-provider.test.ts`
3. `git status --porcelain`

## Expected Results
- Story 4 provider suite: 14 passing tests.
- `TC-2.1b` is active and passing.
- `TC-2.1c` remains placeholder/todo.
- Story 1-3 suites remain green (no regression).
- No unexplained out-of-scope diffs.

## If Blocked or Uncertain
- If TC mapping or counts conflict across files, stop and report exact mismatch.
- If conformance activation status is ambiguous, report with file/line evidence.
- Do NOT infer missing requirements.

## Done When
- [ ] Story 4 is green and audit-complete.
- [ ] `TC-2.1b` activation is verified.
- [ ] Normalization fidelity checks pass.
- [ ] Regression safety checks pass.
- [ ] Scope discipline is confirmed.

## Auditor Output Contract
Return:
- Findings list (ordered by severity)
- Pass/fail per checklist section
- Exact blockers (if any)
- Go/No-Go recommendation
