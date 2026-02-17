# Story 7: End-to-End Verification, Cleanup, and NFR Gates (Chunk 6)

## Overview
Finalize migration by removing legacy streaming emissions, validating dual-provider end-to-end behavior, and meeting required performance/reliability gates.

Story 7 is the release gate for this epic.

## Prerequisites
- Story 0-2 and Story 4-6 are green.
- Provider contract from Story 4/5 pivot is stable:
  - `onUpsert`/`onTurn` callback delivery
  - `sendMessage` resolves at turn-start bind (not turn completion)
- Compatibility window behavior is already operational from Story 6.
- Baselines for performance comparisons are available.
- Story 3 suites may remain intentionally red and out of scope unless explicitly pulled into this story.

## ACs Covered
- AC-6.4b
- AC-8.1
- AC-8.2
- AC-8.3

## TCs Covered
- TC-6.4b
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
- `tests/server/websocket/websocket-compatibility.test.ts` (TC-6.4b legacy-family removal assertion updates)
- `tests/integration/provider-streaming-e2e.test.ts`
- `tests/integration/perf-claude-startup.test.ts`
- `tests/integration/perf-codex-load.test.ts`
- `tests/integration/perf-stream-latency.test.ts`
- `tests/integration/provider-lifecycle-reliability.test.ts`
- `server/websocket.ts` (remove legacy family branch)

## Test Breakdown
- TC-mapped tests: 8
- Non-TC required checks: 5
- Story total: 13
- Running total: 94
- Executable test/check delta in this story: +13

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-7.1-skeleton-red.md` | Add final integration/perf/reliability suites and red baselines |
| Green | `prompt-7.2-green.md` | Remove legacy-family branch and satisfy all Story 7 gates |
| Verify | `prompt-7.R-verify.md` | Final release-gate audit for TC/NFR/cleanup completion |
