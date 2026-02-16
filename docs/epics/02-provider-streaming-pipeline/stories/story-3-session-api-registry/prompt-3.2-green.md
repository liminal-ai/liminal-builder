# Prompt 3.2: Story 3 Green

## Context

**Product:** Liminal Builder.

**Project:** Epic 02 Provider Architecture + Streaming Pipeline.

**Feature:** Session API and provider registry boundary (Tech Design Chunk 2).

**Story:** Implement Story 3 behavior so all 14 Story 3 tests pass for AC-2.2 + AC-6.1/6.2/6.3.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 3 red baseline exists and is committed.
- Story 0/1 contracts are green.
- Story 3 tests already exist and define the behavior contract.

## Reference Documents
(For traceability only; all required execution details are inlined below.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-3-session-api-registry/story.md`

## Inlined Contract Snapshot

### Required route outcomes
- `POST /api/session/create` -> `201` success, `400 UNSUPPORTED_CLI_TYPE`.
- `POST /api/session/:id/load` -> `200` success, `404 SESSION_NOT_FOUND`.
- `GET /api/session/list?projectId=<id>` -> `200` success, `400 PROJECT_ID_REQUIRED`.
- `GET /api/session/:id/status` -> `200` success, `404 SESSION_NOT_FOUND`.
- `POST /api/session/:id/send` -> `202 { turnId }`, `404 SESSION_NOT_FOUND`.
- `POST /api/session/:id/cancel` -> `200`, `404 SESSION_NOT_FOUND`.
- `POST /api/session/:id/kill` -> `200`, `404 SESSION_NOT_FOUND`.

### Required semantics
- Session states represented by `"open" | "loading" | "dead"`.
- `turnId` returned by send route must be the exact provider-returned value.
- Provider registry must resolve known providers and error on unknown cli type.

### Error code ownership
- Request validation: `PROJECT_ID_REQUIRED`.
- Unsupported provider: `UNSUPPORTED_CLI_TYPE`.
- Missing session: `SESSION_NOT_FOUND`.

## Files to Modify
- `server/providers/provider-registry.ts`
- `server/api/session/session-service.ts`
- `server/api/session/routes.ts`
- `server/index.ts`

## Implementation Requirements
1. Implement `provider-registry.ts` with deterministic `register` and `resolve` behavior for typed cli keys.
2. Implement `session-service.ts` operations for create/load/list/status/send/cancel/kill against registry + provider contract.
3. Implement `routes.ts` as a thin HTTP adapter layer over `SessionService` with exact status codes and payloads above.
4. Register session routes from `server/index.ts` without changing existing websocket endpoint (`/ws`) or static-route behavior.
5. Keep implementation at service/mock boundary only; no provider runtime internals.

## Constraints
- Do NOT modify Story 3 test files in Green. Tests are the behavioral contract.
- Do NOT modify files outside the list above.
- Do NOT implement pipeline delivery, websocket compatibility gateway, or browser migration behavior (Story 6 scope).

## If Blocked or Uncertain
- If current app wiring conflicts with route registration requirements, stop and report exact conflict.
- If passing tests requires changing test expectations, stop and escalate instead of editing tests.
- If unresolved type mismatches from earlier stories appear, stop and report root cause.
- Do NOT silently reinterpret contracts.

## Verification
When complete:
1. Run `bun run green-verify`
2. Run `bun run test -- tests/server/providers/provider-registry.test.ts tests/server/api/session-routes.test.ts`

Expected:
- All 14 Story 3 tests pass.
- No test-file diffs are present (guard enforced by `green-verify`).
- Story running total remains 46.

## Done When
- [ ] All Story 3 tests are green.
- [ ] Route/status/error contracts match inlined requirements.
- [ ] `turnId` passthrough contract is enforced.
- [ ] `bun run green-verify` passes.
- [ ] Running total is 46.
