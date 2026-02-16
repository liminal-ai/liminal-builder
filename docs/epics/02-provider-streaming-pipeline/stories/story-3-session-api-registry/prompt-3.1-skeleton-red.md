# Prompt 3.1: Story 3 Skeleton + Red

## Context

**Product:** Liminal Builder is an agentic IDE wrapping coding CLIs with a Fastify + WebSocket backend and browser shell.

**Project:** Epic 02 replaces ACP-centric internals with provider abstraction, canonical contracts, and phased pipeline migration.

**Feature:** Provider Architecture + Streaming Pipeline.

**Story:** Story 3 (Tech Design Chunk 2) creates provider registry + Session API route/service contracts and red tests for AC-2.2, AC-6.1, AC-6.2, AC-6.3.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Technical: Story 0 and Story 1 are green.
- Sharded execution order: Story 2 may already be green, but Story 3 does not require processor wiring.
- Existing server entrypoint:
  - `server/index.ts` currently hosts static + websocket registration and must remain behaviorally intact.

## Reference Documents
(For traceability only; execution content is inlined below.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-3-session-api-registry/story.md`

## Inlined Contract Snapshot

### Session API route contracts to encode in tests

| Method | Path | Success | Error |
|---|---|---|---|
| POST | `/api/session/create` | 201 `{ sessionId, cliType }` | 400 `UNSUPPORTED_CLI_TYPE` |
| POST | `/api/session/:id/load` | 200 `{ sessionId, cliType }` | 404 `SESSION_NOT_FOUND` |
| GET | `/api/session/list?projectId=<projectId>` | 200 `{ sessions: [...] }` | 400 `PROJECT_ID_REQUIRED` |
| GET | `/api/session/:id/status` | 200 `{ sessionId, cliType, isAlive, state }` | 404 `SESSION_NOT_FOUND` |
| POST | `/api/session/:id/send` | 202 `{ turnId }` | 404 `SESSION_NOT_FOUND` |
| POST | `/api/session/:id/cancel` | 200 | 404 `SESSION_NOT_FOUND` |
| POST | `/api/session/:id/kill` | 200 | 404 `SESSION_NOT_FOUND` |

### Canonical turnId ownership rule
- `POST /api/session/:id/send` must return the exact `turnId` returned by `provider.sendMessage()`.
- That value is canonical for all events of the turn.

### Session service shape (target interface)
```ts
type CliType = "claude-code" | "codex";
type SessionState = "open" | "loading" | "dead";

interface SessionService {
  createSession(input: { cliType: CliType; projectDir: string }): Promise<{ sessionId: string; cliType: CliType }>;
  loadSession(input: { sessionId: string }): Promise<{ sessionId: string; cliType: CliType }>;
  listSessions(input: { projectId: string }): Promise<{ sessions: Array<{ sessionId: string; cliType: CliType; projectId: string; status: SessionState }> }>;
  getStatus(input: { sessionId: string }): Promise<{ sessionId: string; cliType: CliType; isAlive: boolean; state: SessionState }>;
  sendMessage(input: { sessionId: string; content: string }): Promise<{ turnId: string }>;
  cancelTurn(input: { sessionId: string }): Promise<void>;
  killSession(input: { sessionId: string }): Promise<void>;
}
```

### Provider registry behavior
- Register provider by `provider.cliType`.
- Resolve known `cliType`.
- Unknown `cliType` throws `UNSUPPORTED_CLI_TYPE`.

### Error code ownership for Story 3 tests
- Route validation code: `PROJECT_ID_REQUIRED`.
- Service/registry/provider mapping codes: `UNSUPPORTED_CLI_TYPE`, `SESSION_NOT_FOUND`.

### Contract files to import from Story 0/1
- `server/providers/provider-types.ts`
- `server/providers/provider-errors.ts`

## TCs In Scope
- TC-2.2a, TC-2.2b
- TC-6.1a, TC-6.1b, TC-6.1c, TC-6.1d, TC-6.1e, TC-6.1f
- TC-6.2a, TC-6.2b, TC-6.2c, TC-6.2d
- TC-6.3a, TC-6.3b

## TC Expectation Map (must be encoded in test names)
- `TC-2.2a`: registry resolves `claude-code`.
- `TC-2.2b`: registry returns unsupported-cli error for unknown type.
- `TC-6.1a`: create route returns 201 with `{ sessionId, cliType }`.
- `TC-6.1b`: create with unsupported cli returns 400 with `UNSUPPORTED_CLI_TYPE`.
- `TC-6.1c`: list route returns project-scoped sessions.
- `TC-6.1d`: list without `projectId` returns 400 with `PROJECT_ID_REQUIRED`.
- `TC-6.1e`: load route calls service/provider load and returns session handle.
- `TC-6.1f`: load missing session returns 404 with `SESSION_NOT_FOUND`.
- `TC-6.2a`: send route calls provider path and returns `turnId`.
- `TC-6.2b`: send missing session returns 404 with `SESSION_NOT_FOUND`.
- `TC-6.2c`: cancel route calls provider cancel path.
- `TC-6.2d`: returned `turnId` equals provider `sendMessage()` result.
- `TC-6.3a`: kill route calls provider kill and removes active session.
- `TC-6.3b`: status route returns `{ isAlive, state }` for session.

## Files to Create/Modify
- `server/providers/provider-registry.ts`
- `server/api/session/session-service.ts`
- `server/api/session/routes.ts`
- `server/index.ts`
- `tests/server/providers/provider-registry.test.ts`
- `tests/server/api/session-routes.test.ts`

## Task
1. Create minimal stubs for registry, session service, and route registration with `NotImplementedError`/explicit placeholders where behavior is not implemented yet.
2. Add exactly 14 Story 3 tests aligned to the TC map above.
3. Prefix each test title with its TC ID (`TC-x.yz`) for grep-able traceability.
4. Use Fastify `inject` + service mocks for route tests; do not test provider internals.
5. Update `server/index.ts` only to register new session routes while preserving existing websocket and static route behavior.

## Constraints
- Do NOT implement provider internals in this story.
- Do NOT implement provider -> processor -> websocket pipeline wiring (Story 6 scope).
- Do NOT modify files outside the list above.
- Keep tests and implementation focused strictly on AC-2.2 + AC-6.1/6.2/6.3.

## If Blocked or Uncertain
- If route/status/error contracts conflict with existing server patterns, stop and report the exact mismatch.
- If a TC cannot be represented without widening scope, stop and ask before proceeding.
- If dependency/typing issues from Story 0/1 appear, report and pause.
- Do NOT silently resolve ambiguity.

## Verification
When complete:
1. Run `bun run red-verify`
2. Run `bun run test -- tests/server/providers/provider-registry.test.ts tests/server/api/session-routes.test.ts`
3. Run `bun run guard:test-baseline-record`

Expected:
- 14 Story 3 tests exist with TC-prefixed names.
- Story 3 suite is red/failing before Green.
- Red baseline is recorded for immutability checks.

## Done When
- [ ] Registry/service/routes stubs exist.
- [ ] Exactly 14 Story 3 tests exist with explicit TC traceability.
- [ ] Story 3 tests are red.
- [ ] `bun run red-verify` passes.
- [ ] `bun run guard:test-baseline-record` passes.
