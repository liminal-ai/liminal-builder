# Prompt 7.R: Story 7 Verification (Release Gate)

## Context
Perform final independent verification before handoff to execution signoff.
These gates are the minimum; also look for unexpected regressions or mismatches with spec/contract beyond this list.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Verify
1. TC coverage in integration tests:
- TC-6.4b
- TC-8.1a..TC-8.1c
- TC-8.2a..TC-8.2b
- TC-8.3a..TC-8.3b

2. NFR checks:
- Claude startup median/P95 benchmark generated.
- Codex load within +/-10% baseline.
- Stream latency within +/-10% baseline.
- First visible token <=200ms.
- Crash/orphan lifecycle checks pass.

3. Legacy removal:
- No legacy streaming family emitted.
- Compatibility cleanup assertions pass.

## Commands
- `bun run verify`
- `bun run verify-all`

## Done When
- [ ] Story 7 verification passes.
- [ ] Epic ready for execution signoff.
