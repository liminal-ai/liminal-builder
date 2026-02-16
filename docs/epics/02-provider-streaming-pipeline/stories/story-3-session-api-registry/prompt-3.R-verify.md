# Prompt 3.R: Story 3 Verification

## Context
Audit Story 3 implementation quality for Session API + provider registry against AC-2.2 and AC-6.1/6.2/6.3.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Inlined Audit Contract

### Registry checks
- `TC-2.2a`: resolve known provider by cli type.
- `TC-2.2b`: unknown cli type returns `UNSUPPORTED_CLI_TYPE`.

### Session lifecycle route checks
- `TC-6.1a`: create route returns `201 { sessionId, cliType }`.
- `TC-6.1b`: unsupported create returns `400 UNSUPPORTED_CLI_TYPE`.
- `TC-6.1c`: list route returns project-scoped sessions.
- `TC-6.1d`: list route without `projectId` returns `400 PROJECT_ID_REQUIRED`.
- `TC-6.1e`: load route exists as `POST /api/session/:id/load` and routes to load behavior.
- `TC-6.1f`: load unknown session returns `404 SESSION_NOT_FOUND`.

### Messaging checks
- `TC-6.2a`: send routes correctly and returns `202 { turnId }`.
- `TC-6.2b`: send unknown session returns `404 SESSION_NOT_FOUND`.
- `TC-6.2c`: cancel routes correctly.
- `TC-6.2d`: returned `turnId` exactly matches provider result.

### Process lifecycle checks
- `TC-6.3a`: kill routes correctly and removes active session.
- `TC-6.3b`: status returns `{ isAlive, state }` with state in `"open" | "loading" | "dead"`.

## Additional Coherence Checks
- Route tests are boundary tests (Fastify `inject` + service mocks), not provider-internal tests.
- `server/index.ts` route registration does not regress websocket/static endpoints.
- No out-of-scope file edits were introduced.

## Commands
1. `bun run verify`
2. `bun run typecheck`
3. `bun run test -- tests/server/providers/provider-registry.test.ts tests/server/api/session-routes.test.ts`

## Expected Results
- Story 3 targeted suites report 14 passing tests.
- Story running total remains 46.
- No contract drift on route paths, status codes, or error codes.

## Done When
- [ ] All Story 3 ACs/TCs are satisfied.
- [ ] Typecheck passes.
- [ ] Story 3 tests pass (14/14).
- [ ] Story is ready for Story 4 handoff.
