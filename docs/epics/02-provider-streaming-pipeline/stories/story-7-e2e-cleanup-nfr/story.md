# Story 7: End-to-End Verification, Cleanup, and NFR Gates (Chunk 6)

## Overview
Execute final end-to-end provider verification, enforce required NFR gates, and complete dead-code cleanup for release signoff.

Story 7 is the release gate for this epic.

## Prerequisites
- Story 0-3 and Story 4-6 are green.
- Story 6 pivot state is complete (upsert-only runtime; no compatibility window).
- Provider callback contract from Story 4/5 remains stable:
  - `onUpsert`/`onTurn` contract shape is preserved.
  - `sendMessage` remains turn-start acknowledged.
- Baselines for performance comparisons are available.

## ACs Covered
- AC-8.1
- AC-8.2
- AC-8.3

## TCs Covered
- TC-8.1a through TC-8.1c
- TC-8.2a through TC-8.2b
- TC-8.3a through TC-8.3b

## Non-TC Required Checks
- Claude startup benchmark median/P95.
- Codex load benchmark within +/-10% baseline.
- Provider-to-render stream latency within +/-10% baseline.
- First visible token latency <=200ms.
- Provider lifecycle crash/orphan cleanup reliability check.

## Files

**Create/Modify:**
- `tests/integration/provider-streaming-e2e.test.ts`
- `tests/integration/perf-claude-startup.test.ts`
- `tests/integration/perf-codex-load.test.ts`
- `tests/integration/perf-stream-latency.test.ts`
- `tests/integration/provider-lifecycle-reliability.test.ts`
- `server/streaming/upsert-stream-processor.ts` (cleanup target)
- `server/streaming/stream-event-schema.ts` (cleanup target)
- `tests/server/streaming/upsert-stream-processor.test.ts` (only if cleanup requires updates)
- `tests/server/contracts/stream-contracts.test.ts` (only if cleanup requires updates)

## Test Breakdown
- TC-mapped tests/checks: 7
- Non-TC required checks: 5
- Story total: 12
- Running total: 89
- Executable test/check delta in this story: +12

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-7.1-skeleton-red.md` | Add final integration/perf/reliability suites and red baselines |
| Green | `prompt-7.2-green.md` | Satisfy Story 7 release gates and cleanup dead code |
| Verify | `prompt-7.R-verify.md` | Final release-gate audit for TC/NFR/cleanup completion |
