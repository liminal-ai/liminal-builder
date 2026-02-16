# Prompt 7.2: Story 7 Green

## Context
Complete Story 7: remove legacy branch and pass final E2E + NFR gates.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Files to Modify
- `server/websocket.ts`
- `tests/integration/provider-streaming-e2e.test.ts`
- `tests/integration/perf-claude-startup.test.ts`
- `tests/integration/perf-codex-load.test.ts`
- `tests/integration/perf-stream-latency.test.ts`
- `tests/integration/provider-lifecycle-reliability.test.ts`

## Requirements
- Remove legacy message-family emissions after compatibility window.
- Pass all Story 7 TC-mapped integration tests.
- Pass all 5 NFR checks against defined baselines/thresholds.

## Verification
- `bun run verify`
- `bun run test:integration`
- `bun run verify-all`

Expected:
- Story 7 tests/checks pass.
- Full running total reaches 92.

## Done When
- [ ] Legacy migration cleanup complete.
- [ ] E2E + NFR gates are green.
