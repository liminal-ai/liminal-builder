# Prompt 7.2: Story 7 Green

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context.

## Context

**Product/Project/Feature:** Liminal Builder, Epic 02 Provider Architecture + Streaming Pipeline.

**Story:** Complete Story 7 by passing final TC + NFR release gates and finishing dead-code cleanup, while preserving Story 6 pivoted runtime behavior.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 7 red baseline exists.
- Story 0-3 and Story 4-6 suites remain green.
- Story 6 pivot contract is in effect (upsert-only runtime; no compatibility window).

## Reference Documents
(For human traceability only. Execution details are inlined.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-7-e2e-cleanup-nfr/story.md`

## Inlined Implementation Contract

### Required release-gate behavior
- Keep upsert-only runtime behavior fully functional (`session:upsert`, `session:turn`, `session:history`).
- Do not reintroduce compatibility-window behavior (`session:hello`, `session:hello:ack`, dual-family routing).
- Ensure cleanup does not break dual-provider runtime behavior.
- Preserve Story 6 runtime semantics:
  - send path remains turn-start acknowledged.
  - active streaming path remains ACP `onEvent` callback translation in websocket/session-manager path.

### Required outcomes
- All TC-mapped integration checks pass:
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

## Primary Files to Modify
- `tests/integration/provider-streaming-e2e.test.ts`
- `tests/integration/perf-claude-startup.test.ts`
- `tests/integration/perf-codex-load.test.ts`
- `tests/integration/perf-stream-latency.test.ts`
- `tests/integration/provider-lifecycle-reliability.test.ts`
- `server/streaming/upsert-stream-processor.ts` (if cleanup requires)
- `server/streaming/stream-event-schema.ts` (if cleanup requires)
- `tests/server/streaming/upsert-stream-processor.test.ts` (if cleanup requires)
- `tests/server/contracts/stream-contracts.test.ts` (if cleanup requires)

Adjacent file updates are allowed when mechanically required by the same Story 7 changes (for example shared exports/types, integration harness wiring, script glue), with explicit justification in handoff.

## Non-Goals
- No additional feature work.
- No provider implementation rewrites unless objectively required by release-gate failures.
- No scope expansion beyond Story 7 release criteria.

## Constraints
- Do NOT rewrite tests casually in green.
- If cleanup requires test updates, keep TC/NFR intent unchanged and document why.
- Do NOT add new dependencies.
- Do NOT weaken or skip NFR assertions.
- Keep changes focused on Story 7 release-gate and cleanup goals; avoid unrelated edits.

## If Blocked or Uncertain
- If baselines or instrumentation are insufficient for NFR comparison, stop and report exact gap.
- If cleanup conflicts with Story 6 pivot contract, stop and report with evidence.
- Do NOT silently relax release criteria.

## Verification
When complete:
1. Run `bun run red-verify`
2. Run `bunx vitest run tests/server/websocket/websocket-compatibility.test.ts`
3. Run `bunx vitest run tests/integration/provider-streaming-e2e.test.ts tests/integration/perf-claude-startup.test.ts tests/integration/perf-codex-load.test.ts tests/integration/perf-stream-latency.test.ts tests/integration/provider-lifecycle-reliability.test.ts`
4. Run `bun run test:integration`
5. Run `bun run verify-all`
6. Run `bun run green-verify`

Expected:
- Story 7 TC-mapped tests/checks and NFR checks pass (12 total).
- Full running total reaches 89.
- Epic is ready for execution signoff.
- `green-verify` passes.

## Done When
- [ ] Story 6 pivot contract remains intact (no compatibility behavior reintroduced).
- [ ] All Story 7 TC-mapped checks are green (7).
- [ ] All 5 NFR checks are green.
- [ ] Verification commands pass.
- [ ] No out-of-scope rewrites occurred.

## Handoff Output Contract
Return:
- Files changed
- TC and NFR pass summary (7 + 5)
- Baseline comparison summary
- Any residual risk before signoff
