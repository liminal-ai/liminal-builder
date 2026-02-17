# Prompt 7.R: Story 7 Verification (Release Gate)

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context operating as an independent release auditor.

## Context
Perform final Story 7 verification for release signoff: TC coverage, NFR gates, dead-code cleanup, pivot-contract preservation, and regression safety.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Reference Documents
(For traceability.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-7-e2e-cleanup-nfr/story.md`
- `docs/epics/02-provider-streaming-pipeline/stories/README.md`

## Verification Checklist

### 1) Scope and cleanup audit
- Confirm Story 7 changes are primarily in Story 7 scoped files.
- Confirm dead-code cleanup does not remove active runtime paths used by Story 6 behavior.
- Confirm no compatibility-window behavior is reintroduced.
- Allow adjacent-file updates only when mechanically required by the same Story 7 work, with explicit justification.

### 2) TC coverage audit (integration)
- Verify passing coverage for:
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
- Active streaming remains upsert-only (`session:upsert`, `session:turn`, `session:history`).
- No `session:hello` / `session:hello:ack` flow exists.
- Send path remains turn-start acknowledged.
- No reintroduction of completion-blocked send semantics.

### 5) Regression safety audit
- Confirm Story 0-6 behavior is not regressed.
- Confirm full verification pipeline passes.

### 6) Traceability and totals
- Story 7 contributes 12 checks/tests (7 TC + 5 NFR).
- Epic running total is 89 (per stories ledger).

## Commands
1. `bun run red-verify`
2. `bunx vitest run tests/server/websocket/websocket-compatibility.test.ts`
3. `bunx vitest run tests/integration/provider-streaming-e2e.test.ts tests/integration/perf-claude-startup.test.ts tests/integration/perf-codex-load.test.ts tests/integration/perf-stream-latency.test.ts tests/integration/provider-lifecycle-reliability.test.ts`
4. `bun run test:integration`
5. `bun run verify-all`
6. `bun run green-verify`
7. `git status --porcelain`

## Expected Results
- All Story 7 release-gate checks pass.
- Upsert-only runtime contract is preserved.
- Full epic verification is green.
- No unexplained out-of-scope diffs.

## If Blocked or Uncertain
- If baseline comparisons are missing or ambiguous, report exact missing artifacts and fail verification.
- If cleanup conflicts with Story 6 pivot contract, report with file/line evidence.
- Do NOT infer missing requirements.

## Done When
- [ ] Story 7 release-gate verification passes.
- [ ] TC and NFR coverage are complete (7 + 5).
- [ ] Cleanup is validated.
- [ ] Pivot-contract preservation is validated.
- [ ] Epic is ready for execution signoff.

## Auditor Output Contract
Return:
- Findings list (ordered by severity)
- Pass/fail per checklist section
- Exact blockers (if any)
- Final recommendation (proceed / hold)
