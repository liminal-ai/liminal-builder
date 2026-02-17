# Prompt 7.R: Story 7 Verification (Release Gate)

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context operating as an independent release auditor.

## Context
Perform final Story 7 verification for release signoff: TC coverage, NFR gates, legacy cleanup, pivot-contract preservation, and regression safety.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Reference Documents
(For traceability.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-7-e2e-cleanup-nfr/story.md`

## Verification Checklist

### 1) Scope and cleanup audit
- Confirm legacy streaming family emission path is removed from active runtime flow.
- Confirm cleanup is limited to Story 7 scope with justified file changes.

### 2) TC coverage audit (integration)
- Verify passing coverage for:
  - `TC-6.4b`
  - `TC-8.1a..TC-8.1c`
  - `TC-8.2a..TC-8.2b`
  - `TC-8.3a..TC-8.3b`
- Confirm TC IDs are visible in test names or clearly mapped in-suite.

### 3) NFR gate audit
- Claude startup benchmark includes median and P95 output.
- Codex load benchmark is within +/-10% baseline.
- Stream latency benchmark is within +/-10% baseline.
- First visible token latency is <=200ms.
- Crash/orphan lifecycle reliability checks pass.

### 4) Pivot-contract preservation audit
- Provider callback flow still uses `onUpsert`/`onTurn`.
- Cleanup did not regress turn-start send acknowledgment behavior.
- No reintroduction of completion-blocked send semantics.

### 5) Regression safety audit
- Confirm Story 0-2 and Story 4-6 behavior is not regressed by cleanup.
- Confirm full verification pipeline passes aside from known out-of-scope reds.

### 6) Traceability and totals
- Story 7 contributes 13 checks/tests (8 TC + 5 NFR).
- Epic running total is 94.

## Commands
1. `bun run red-verify`
2. `bunx vitest run tests/server/websocket/websocket-compatibility.test.ts`
3. `bun run test:integration`
4. `bun run verify-all`
5. `bun run green-verify`
6. `git status --porcelain`

## Expected Results
- All Story 7 release-gate checks pass.
- Legacy-family cleanup is complete and stable.
- Full epic verification is green except known Story 3 out-of-scope reds unless Story 3 was completed.
- No unexplained out-of-scope diffs.

## If Blocked or Uncertain
- If baseline comparisons are missing or ambiguous, report exact missing artifacts and fail verification.
- If cleanup state conflicts with Story 6 migration assumptions, report with file/line evidence.
- Do NOT infer missing requirements.

## Done When
- [ ] Story 7 release-gate verification passes.
- [ ] TC and NFR coverage are complete.
- [ ] Legacy cleanup is validated.
- [ ] Pivot-contract preservation is validated.
- [ ] Epic is ready for execution signoff.

## Auditor Output Contract
Return:
- Findings list (ordered by severity)
- Pass/fail per checklist section
- Exact blockers (if any)
- Final recommendation (proceed / hold)
