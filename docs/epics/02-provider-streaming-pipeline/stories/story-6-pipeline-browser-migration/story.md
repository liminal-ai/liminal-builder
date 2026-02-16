# Story 6: Pipeline Integration and Browser Migration

## Overview
Wire provider events through processor to WebSocket delivery and migrate browser rendering to upsert family with compatibility negotiation.

## Prerequisites
- Story 5 complete.
- Both providers emit canonical event envelopes.

## ACs Covered
- AC-6.4a, AC-6.4c
- AC-7.1, AC-7.2, AC-7.3, AC-7.4

## TCs Covered
- TC-6.4a, TC-6.4c
- TC-7.1a through TC-7.1c
- TC-7.2a through TC-7.2c
- TC-7.3a through TC-7.3b
- TC-7.4a

## Files

**Create/Modify:**
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

## Test Breakdown
- `tests/server/websocket/websocket-compatibility.test.ts`: 3 tests (Story 6 subset)
- `tests/server/pipeline/pipeline-integration.test.ts`: 3 tests
- `tests/server/pipeline/session-history-pipeline.test.ts`: 2 tests
- `tests/client/upsert/portlet-upsert-rendering.test.ts`: 3 tests
- Story total: 11
- Running total: 79

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-6.1-skeleton-red.md` | Add delivery/gateway/client skeleton and failing tests |
| Green | `prompt-6.2-green.md` | Implement wiring, negotiation, and rendering migration |
| Verify | `prompt-6.R-verify.md` | Validate one-family rule and history/render behavior |
