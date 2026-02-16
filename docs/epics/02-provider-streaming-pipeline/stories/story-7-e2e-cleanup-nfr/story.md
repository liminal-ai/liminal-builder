# Story 7: End-to-End Verification, Cleanup, and NFR Gates

## Overview
Finalize migration by removing legacy emissions, validating dual-provider E2E behavior, and meeting performance/reliability gates.

## Prerequisites
- Story 6 complete.
- Compatibility negotiation operational and instrumented.

## ACs Covered
- AC-6.4b
- AC-8.1, AC-8.2, AC-8.3

## TCs Covered
- TC-6.4b
- TC-8.1a through TC-8.1c
- TC-8.2a through TC-8.2b
- TC-8.3a through TC-8.3b

## Non-TC Required Checks
- Claude startup benchmark median/P95.
- Codex load benchmark within +/-10% baseline.
- Stream latency benchmark within +/-10% baseline.
- First visible token <=200ms.
- Provider lifecycle crash/orphan cleanup reliability check.

## Files

**Create/Modify:**
- `tests/integration/provider-streaming-e2e.test.ts`
- `tests/integration/perf-claude-startup.test.ts`
- `tests/integration/perf-codex-load.test.ts`
- `tests/integration/perf-stream-latency.test.ts`
- `tests/integration/provider-lifecycle-reliability.test.ts`
- `server/websocket.ts` (remove legacy branch)

## Test Breakdown
- TC-mapped tests: 8
- Non-TC required checks: 5
- Story total: 13
- Running total: 92

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-7.1-skeleton-red.md` | Add final integration/perf suites and failing assertions |
| Green | `prompt-7.2-green.md` | Implement cleanup and make all Story 7 checks pass |
| Verify | `prompt-7.R-verify.md` | Final release-gate verification |
