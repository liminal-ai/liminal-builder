# Prompt 6.2: Story 6 Green

## Context
Implement Story 6 pipeline integration and browser migration behavior.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Files to Modify
- `server/websocket/stream-delivery.ts`
- `server/websocket/compatibility-gateway.ts`
- `server/websocket.ts`
- `client/shell/shell.js`
- `client/portlet/portlet.js`
- Story 6 test files for expectation corrections only.

## Requirements
- Provider canonical events pass through processor to upsert transport.
- Browser renders by itemId replacement semantics.
- Session load returns metadata on HTTP and history on `session:history` over WS.
- Compatibility negotiation selects exactly one message family per connection.

## Verification
- `bun run verify`
- `bun run test -- tests/server/websocket/websocket-compatibility.test.ts tests/server/pipeline/pipeline-integration.test.ts tests/server/pipeline/session-history-pipeline.test.ts tests/client/upsert/portlet-upsert-rendering.test.ts`

Expected:
- 11 Story 6 tests pass.

## Done When
- [ ] Story 6 is green and migration-safe.
- [ ] Running total reaches 79.
