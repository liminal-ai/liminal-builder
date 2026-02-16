# Story 3: Session API and Provider Registry (Chunk 2)

## Overview
Implement provider registry and Session API route/service behavior for session lifecycle, messaging, and process lifecycle controls.

This story corresponds to Tech Design Chunk 2 and does not implement provider internals or provider -> processor wiring.

## Prerequisites
- **Technical dependency:** Story 0 and Story 1 are complete and green (contracts, interfaces, shared types).
- **Sharded orchestration order:** execute after Story 2 in this prompt pack sequence.
- Story 6 is where provider -> processor -> websocket integration occurs; Story 3 only establishes API and registry boundaries.

## ACs Covered
- AC-2.2
- AC-6.1
- AC-6.2
- AC-6.3

## TCs Covered
- TC-2.2a through TC-2.2b
- TC-6.1a through TC-6.1f
- TC-6.2a through TC-6.2d
- TC-6.3a through TC-6.3b

## Files

**Create/Modify:**
- `server/providers/provider-registry.ts`
- `server/api/session/session-service.ts`
- `server/api/session/routes.ts`
- `server/index.ts`
- `tests/server/providers/provider-registry.test.ts`
- `tests/server/api/session-routes.test.ts`

## Test Breakdown
- `tests/server/providers/provider-registry.test.ts`: 2 tests
- `tests/server/api/session-routes.test.ts`: 12 tests
- Story total: 14
- Running total: 46

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-3.1-skeleton-red.md` | Create stubs and 14 TC-traceable failing tests with explicit route contracts |
| Green | `prompt-3.2-green.md` | Implement registry/service/routes to satisfy all Story 3 contracts without test changes |
| Verify | `prompt-3.R-verify.md` | Audit full AC/TC coverage, contract semantics, and running-total readiness |
