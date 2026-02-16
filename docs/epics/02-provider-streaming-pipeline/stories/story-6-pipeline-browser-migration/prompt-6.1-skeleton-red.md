# Prompt 6.1: Story 6 Skeleton + Red

## Context
Implement Story 6 red phase for pipeline wiring and browser migration.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:** Stories 0-5 green.

## TCs In Scope
- TC-6.4a, TC-6.4c
- TC-7.1a..TC-7.1c
- TC-7.2a..TC-7.2c
- TC-7.3a..TC-7.3b
- TC-7.4a

## Files to Create/Modify
- `server/websocket/stream-delivery.ts`
- `server/websocket/compatibility-gateway.ts`
- `server/websocket.ts`
- `client/shell/shell.js`
- `client/portlet/portlet.js`
- `shared/stream-contracts.ts`
- `tests/server/websocket/websocket-compatibility.test.ts`
- `tests/server/pipeline/pipeline-integration.test.ts`
- `tests/server/pipeline/session-history-pipeline.test.ts`
- `tests/client/upsert/portlet-upsert-rendering.test.ts`

## Task
1. Add skeleton delivery/gateway/client routing.
2. Add 11 tests with TC IDs.
3. Include `session:hello` negotiation and one-family-per-connection assertions.

## Constraints
- No legacy removal yet (that is Story 7).
- Do not emit both families on a single connection.

## Verification
- `bun run red-verify`
- `bun run test -- tests/server/websocket/websocket-compatibility.test.ts tests/server/pipeline/pipeline-integration.test.ts tests/server/pipeline/session-history-pipeline.test.ts tests/client/upsert/portlet-upsert-rendering.test.ts`

Expected:
- Story 6 test suites are red before green.

## Done When
- [ ] Story 6 red baseline established across all four suites.
