# Story 3: Session API and Provider Registry

## Overview
Implement provider registry and Session API lifecycle/messaging/process routes.

## Prerequisites
- Story 2 complete.
- Upsert processor available for downstream wiring.

## ACs Covered
- AC-2.2
- AC-6.1, AC-6.2, AC-6.3

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
| Skeleton+Red | `prompt-3.1-skeleton-red.md` | Add route/service/registry stubs and failing tests |
| Green | `prompt-3.2-green.md` | Implement routing and lifecycle behavior |
| Verify | `prompt-3.R-verify.md` | Validate API semantics and turnId contract |
