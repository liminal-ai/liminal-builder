# Prompt 7.1: Story 7 Skeleton + Red

## Context
Implement Story 7 red phase: final integration, cleanup gates, and NFR suites.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:** Stories 0-6 green.

## TCs In Scope
- TC-6.4b
- TC-8.1a..TC-8.1c
- TC-8.2a..TC-8.2b
- TC-8.3a..TC-8.3b

## Non-TC Required Checks
- perf-claude-startup
- perf-codex-load
- perf-stream-latency
- first-visible-token latency assertion
- provider-lifecycle reliability

## Files to Create/Modify
- `tests/integration/provider-streaming-e2e.test.ts`
- `tests/integration/perf-claude-startup.test.ts`
- `tests/integration/perf-codex-load.test.ts`
- `tests/integration/perf-stream-latency.test.ts`
- `tests/integration/provider-lifecycle-reliability.test.ts`
- `server/websocket.ts` (legacy branch cleanup prep)

## Task
1. Add Story 7 integration/perf/reliability suites with explicit pass criteria.
2. Add assertions for legacy-family removal sequencing.
3. Ensure tests are red/failing until cleanup and implementation complete.

## Constraints
- Do not skip NFR checks.
- Keep thresholds explicit and baseline-comparable.

## Verification
- `bun run red-verify`
- `bun run test:integration`

Expected:
- New Story 7 suites execute and fail/red before green.

## Done When
- [ ] Story 7 red baseline established.
