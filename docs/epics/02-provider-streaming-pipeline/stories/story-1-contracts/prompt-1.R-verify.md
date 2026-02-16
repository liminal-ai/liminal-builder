# Prompt 1.R: Story 1 Verification

## Context
Audit Story 1 against AC/TC traceability.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Verify
1. Confirm TC-1.x and TC-2.1x coverage exists in the two test files.
2. Confirm invalid payloads are rejected.
3. Confirm envelope/payload type mismatch is rejected.
4. Confirm interface conformance checks exist for both providers.

## Commands
- `bun run verify`
- `bun run test -- tests/server/contracts/stream-contracts.test.ts tests/server/providers/provider-interface.test.ts`

## Done When
- [ ] Story 1 is green and traceable.
- [ ] No unapproved scope changes.
