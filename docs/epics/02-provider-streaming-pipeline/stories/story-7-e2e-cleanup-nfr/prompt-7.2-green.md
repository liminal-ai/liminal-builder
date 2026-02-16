# Prompt 7.2: Story 7 Green

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context.

## Context

**Product/Project/Feature:** Liminal Builder, Epic 02 Provider Architecture + Streaming Pipeline.

**Story:** Complete Story 7 by removing legacy streaming branch behavior and passing all final TC + NFR release gates.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 7 red baseline exists.
- Story 0 through Story 6 suites remain green.

## Reference Documents
(For human traceability only. Execution details are inlined.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-7-e2e-cleanup-nfr/story.md`

## Inlined Implementation Contract

### Required cleanup behavior
- Remove legacy streaming-family emissions after compatibility window.
- Keep new upsert family and turn/history flow fully functional.
- Ensure cleanup does not break dual-provider runtime behavior.

### Required release-gate outcomes
- All TC-mapped integration tests pass:
  - TC-6.4b
  - TC-8.1a..TC-8.1c
  - TC-8.2a..TC-8.2b
  - TC-8.3a..TC-8.3b
- All 5 NFR checks pass with explicit baseline comparisons.

### NFR thresholds
- Claude startup benchmark reports median + P95.
- Codex load within +/-10% baseline.
- Stream latency within +/-10% baseline.
- First visible token <=200ms.
- Crash/orphan lifecycle reliability checks pass.

## Files to Modify
- `server/websocket.ts`

## Optional Files (only if red contract is objectively wrong)
- `tests/integration/provider-streaming-e2e.test.ts`
- `tests/integration/perf-claude-startup.test.ts`
- `tests/integration/perf-codex-load.test.ts`
- `tests/integration/perf-stream-latency.test.ts`
- `tests/integration/provider-lifecycle-reliability.test.ts`

If needed, document exact contract mismatch before editing tests.

## Non-Goals
- No additional feature work.
- No provider implementation rewrites unless required to satisfy Story 7 gates.
- No scope expansion beyond Story 7 release criteria.

## Constraints
- Do NOT modify tests in green unless there is a proven contract inconsistency.
- Do NOT add new dependencies.
- Do NOT weaken or skip NFR assertions.
- Do NOT modify files outside scoped list unless explicitly justified.

## If Blocked or Uncertain
- If baselines or instrumentation are insufficient for NFR comparison, stop and report exact gap.
- If legacy cleanup conflicts with Story 6 compatibility guarantees, stop and report with evidence.
- Do NOT silently relax release criteria.

## Verification
When complete:
1. Run `bun run green-verify`
2. Run `bun run test:integration`
3. Run `bun run verify-all`

Expected:
- Story 7 TC-mapped tests and NFR checks pass.
- Full running total reaches 92.
- Epic is ready for execution signoff.

## Done When
- [ ] Legacy-family cleanup is complete.
- [ ] All Story 7 TC-mapped tests are green.
- [ ] All 5 NFR checks are green.
- [ ] `green-verify`, `test:integration`, and `verify-all` pass.
- [ ] No out-of-scope or unapproved test rewrites occurred.

## Handoff Output Contract
Return:
- Files changed
- TC and NFR pass summary
- Baseline comparison summary
- Any residual risk before signoff
