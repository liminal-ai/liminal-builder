# Story 6: Pipeline Integration and Browser Migration (Chunk 5)

## Overview
Wire provider callback outputs (`onUpsert`/`onTurn`) through websocket delivery and migrate browser rendering to the upsert message family with compatibility negotiation.

This story introduces the compatibility window and one-family-per-connection routing. Legacy-family removal is explicitly deferred to Story 7.

## Prerequisites
- Story 0-2 are green.
- Story 4 and Story 5 are green with provider callback contract:
  - providers emit upsert/turn objects through `onUpsert`/`onTurn`.
  - `sendMessage` resolves after turn-start bind.
- Upsert processor behavior is green and stable for canonical-envelope sources that still rely on it.
- Story 3 suites may remain intentionally red and out of scope unless explicitly included.

## ACs Covered
- AC-6.4a
- AC-6.4c
- AC-7.1
- AC-7.2
- AC-7.3
- AC-7.4

## TCs Covered
- TC-6.4a
- TC-6.4c
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
- `shared/types.ts`
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
- Running total: 81
- Executable test delta in this story: +11

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-6.1-skeleton-red.md` | Add delivery/gateway/client skeleton and 11 TC-traceable red tests |
| Green | `prompt-6.2-green.md` | Implement callback-to-delivery wiring, compatibility routing, history path, and browser upsert rendering |
| Verify | `prompt-6.R-verify.md` | Audit one-family routing, pipeline correctness, rendering semantics, and migration safety |
