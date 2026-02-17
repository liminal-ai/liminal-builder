# Prompt 7.1: Story 7 Skeleton + Red

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context.

## Context

**Product:** Liminal Builder.

**Project:** Epic 02 Provider Architecture + Streaming Pipeline.

**Feature:** Final release-gate validation (E2E + NFR + cleanup).

**Story:** Story 7 (Tech Design Chunk 6) adds final integration coverage, NFR validation suites, and cleanup gates before release signoff.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 0-3 and Story 4-6 are green.
- Story 6 pivot state is complete (upsert-only runtime).

## Reference Documents
(For human traceability only. Execution details are inlined below.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-7-e2e-cleanup-nfr/story.md`

## Inlined Contract Snapshot

### TC scope
- TC-8.1a..TC-8.1c
- TC-8.2a..TC-8.2b
- TC-8.3a..TC-8.3b

### Non-TC required release checks
- Claude startup-to-first-token benchmark reports median and P95.
- Codex load benchmark is within +/-10% of baseline.
- Stream latency benchmark is within +/-10% of baseline.
- First visible token latency <=200ms.
- Provider lifecycle crash/orphan cleanup checks pass.

### Cleanup boundary
- Story 6 already removed compatibility-window and legacy streaming-family behavior.
- Story 7 must not reintroduce compatibility behavior.
- Story 7 focuses on final E2E/NFR gates and dead-code cleanup not used by the active runtime.
- Story 7 must preserve Story 6 runtime semantics (upsert-only delivery, turn-start send acknowledgment).

### File responsibility split
- Integration/perf/reliability test files own release-gate assertions.
- Streaming dead-code cleanup targets are `upsert-stream-processor.ts` and `stream-event-schema.ts` (plus dependent tests if needed).

## TC Expectation Map (must be encoded in test names)
- `TC-8.1a`: Claude create/send/stream flow works end-to-end.
- `TC-8.1b`: Claude tool calls render with name/arguments/result.
- `TC-8.1c`: Claude cancel interrupts turn and session remains reusable.
- `TC-8.2a`: Codex create/send/stream flow works end-to-end.
- `TC-8.2b`: Codex tool calls render with name/arguments/result.
- `TC-8.3a`: switching between Claude and Codex tabs preserves state.
- `TC-8.3b`: loading session history works correctly.

## Primary Files to Create/Modify
- `tests/integration/provider-streaming-e2e.test.ts`
- `tests/integration/perf-claude-startup.test.ts`
- `tests/integration/perf-codex-load.test.ts`
- `tests/integration/perf-stream-latency.test.ts`
- `tests/integration/provider-lifecycle-reliability.test.ts`
- `server/streaming/upsert-stream-processor.ts` (cleanup prep only in red)
- `server/streaming/stream-event-schema.ts` (cleanup prep only in red)
- `tests/server/streaming/upsert-stream-processor.test.ts` (only if cleanup prep requires)
- `tests/server/contracts/stream-contracts.test.ts` (only if cleanup prep requires)

Adjacent file updates are allowed when mechanically required by the same Story 7 contract shift (for example test harness wiring, shared type fallout, script glue), with explicit justification in handoff.

## Task
1. Add Story 7 integration and NFR test suites/checks with explicit pass/fail criteria.
2. Encode explicit release-gate assertions for the 7 TC checks and 5 NFR checks.
3. Ensure Story 7 suites are red/failing before green implementation.

## Non-Goals
- No provider architecture redesign.
- No new feature development beyond release-gate validation and dead-code cleanup.
- No Story 8+ scope expansion.

## Constraints
- Do NOT skip any NFR required checks.
- Keep thresholds explicit and baseline-comparable.
- Keep changes focused on Story 7 goals; avoid unrelated edits.
- Every TC-mapped test title must include TC ID.

## If Blocked or Uncertain
- If required baseline artifacts are missing, stop and report exact missing inputs.
- If any NFR cannot be encoded deterministically, stop and report.
- Do NOT silently weaken release gates.

## Verification
When complete:
1. Run `bun run red-verify`
2. Run `bunx vitest run tests/integration/provider-streaming-e2e.test.ts tests/integration/perf-claude-startup.test.ts tests/integration/perf-codex-load.test.ts tests/integration/perf-stream-latency.test.ts tests/integration/provider-lifecycle-reliability.test.ts`
3. Run `bun run test:integration`
4. Run `bun run guard:test-baseline-record`

Expected:
- Story 7 integration/perf/reliability suites execute and fail/red before green.
- Red baseline is recorded.

## Done When
- [ ] Story 7 scoped files are created/updated.
- [ ] TC-mapped and NFR test/check suites exist (12 total checks).
- [ ] Story 7 suites are red.
- [ ] `bun run red-verify` passes.
- [ ] `bun run guard:test-baseline-record` passes.

## Handoff Output Contract
Return:
- Files changed
- Story 7 test/check inventory (7 TC + 5 NFR)
- Red verification summary
- Baseline dependencies or blockers
