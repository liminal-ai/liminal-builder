# Prompt 6.2: Story 6 Green

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context.

## Context

**Product/Project/Feature:** Liminal Builder, Epic 02 Provider Architecture + Streaming Pipeline.

**Story:** Bring Story 6 to green by implementing delivery wiring, compatibility routing, and browser upsert rendering.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 6 red baseline exists.
- Story 0-3 + Story 4-5 suites remain green.

## Reference Documents
(For human traceability only. Execution details are inlined.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-6-pipeline-browser-migration/story.md`

## Inlined Implementation Contract

### Required behavior
- Provider callback outputs (`onUpsert`/`onTurn`) flow through WebSocket delivery to browser.
- Browser renders upserts by `itemId` replacement/update semantics.
- HTTP load returns session metadata; history entries arrive over WebSocket `session:history`.
- Compatibility negotiation selects one family per connection and enforces single-family routing.

### Compatibility window constraints
- Story 6 supports both families across rollout.
- Per-connection routing must never emit both families.
- Legacy removal is explicitly deferred to Story 7.
- TC-7.4a in this story removes direct ACP-to-WebSocket bridge usage from active flow. Legacy message-family emissions remain available via compatibility routing until Story 7.

### File responsibility boundary
- `stream-delivery.ts`: emit `session:upsert`, `session:turn`, `session:history` for new family.
- `compatibility-gateway.ts`: negotiation + selected-family routing.
- `websocket.ts`: connection wiring to delivery/gateway; remove active direct ACP path usage.
- `session-service.ts`: only modify if callback-to-delivery ownership is objectively missing from prior stories.
- `shell.js`: client hello capability handshake.
- `portlet.js`: upsert render/update behavior.
- `shared/stream-contracts.ts` + `shared/types.ts`: aligned WebSocket payload contracts.

### Inlined contract snippets for implementation
```ts
type StreamProtocolFamily = "legacy" | "upsert-v1";
interface ConnectionCapabilities { streamProtocol?: "upsert-v1" }
interface ConnectionContext { connectionId: string; selectedFamily: StreamProtocolFamily }

interface CompatibilityGateway {
  negotiate(connectionId: string, capabilities?: ConnectionCapabilities): ConnectionContext;
  deliver(context: ConnectionContext, payload: { upsert?: UpsertObject; turn?: TurnEvent; legacy?: unknown }): void;
}
```

```ts
interface WsUpsertMessage { type: "session:upsert"; sessionId: string; payload: UpsertObject }
interface WsTurnMessage { type: "session:turn"; sessionId: string; payload: TurnEvent }
interface WsHistoryMessage { type: "session:history"; sessionId: string; entries: UpsertObject[] }
```

### Implementation guidance by file (minimum required)
```ts
// server/websocket/compatibility-gateway.ts
// 1) keep connection-scoped selected family in memory
// 2) negotiate() picks "upsert-v1" only when requested; otherwise default "legacy"
// 3) emit hello ack once family is selected
// 4) deliver() routes only one family for a connection, never both
```

```ts
// server/websocket/stream-delivery.ts
// 1) expose deliverUpsert/deliverTurn/deliverHistory helpers
// 2) wrap payloads in session:upsert/session:turn/session:history contracts
// 3) delegate family selection to compatibility gateway
```

```ts
// server/websocket.ts
// 1) wire session callback outputs (onUpsert/onTurn) to stream delivery
// 2) handle session:hello negotiation + session:hello:ack response
// 3) remove active direct ACP bridge flow usage (TC-7.4a boundary)
// 4) keep legacy family emission path only through compatibility routing (Story 6 window)
```

```js
// client/shell/shell.js
// on WebSocket open -> send: { type: "session:hello", streamProtocol: "upsert-v1" }
// on ack -> record selectedFamily for diagnostics
```

```js
// client/portlet/portlet.js
// maintain item state keyed by itemId
// for session:upsert, replace item snapshot by itemId (no append drift)
// for tool_call, render create -> complete transition in same item slot
// for interleaved items, isolate updates by itemId
```

```ts
// shared/stream-contracts.ts and shared/types.ts
// export session:hello/session:hello:ack/session:upsert/session:turn/session:history shapes
// align server and client naming/casing for WebSocket message discriminators
```

## Files to Modify
- `server/websocket/stream-delivery.ts`
- `server/websocket/compatibility-gateway.ts`
- `server/websocket.ts`
- `server/api/session/session-service.ts` (only if callback-to-delivery ownership is objectively missing)
- `client/shell/shell.js`
- `client/portlet/portlet.js`
- `shared/stream-contracts.ts`
- `shared/types.ts`

## Optional Files (only if red contract is objectively wrong)
- `tests/server/websocket/websocket-compatibility.test.ts`
- `tests/server/pipeline/pipeline-integration.test.ts`
- `tests/server/pipeline/session-history-pipeline.test.ts`
- `tests/client/upsert/portlet-upsert-rendering.test.ts`

If needed, document exact contract mismatch before editing tests.

## Non-Goals
- No legacy-family removal (Story 7).
- No provider internal behavior rewrites.
- No new API routes or route-contract changes.
- No Context/Redis integration.

## Constraints
- Do NOT rewrite tests casually in green.
- If pivot-contract alignment requires test updates, keep TC intent unchanged and document why.
- Do NOT add new dependencies.
- Do NOT modify files outside scoped list; optional files listed above are explicit in-scope exceptions.
- Preserve red test intent and TC naming.
- One-family-per-connection rule is mandatory.

## If Blocked or Uncertain
- If compatibility routing conflicts with existing websocket behavior, stop and report exact conflict.
- If passing requires relaxing duplicate-processing safeguards, stop and report.
- Do NOT silently reinterpret migration boundaries.

## Verification
When complete:
1. Run `bun run red-verify`
2. Run `bunx vitest run tests/server/websocket/websocket-compatibility.test.ts tests/server/pipeline/pipeline-integration.test.ts tests/server/pipeline/session-history-pipeline.test.ts tests/client/upsert/portlet-upsert-rendering.test.ts`
3. Run `bunx vitest run tests/server/providers/claude-sdk-provider.test.ts`
4. Run `bunx vitest run tests/server/providers/codex-acp-provider.test.ts`
5. Run `bunx vitest run tests/server/providers/provider-interface.test.ts`
6. Run `bun run green-verify`

Expected:
- Story 6: 11 tests pass.
- Running traceability total remains 81.
- Compatibility window behavior is migration-safe and duplicate-free.
- `green-verify` passes with no expected out-of-scope failures.

## Done When
- [ ] Story 6 scoped tests are green.
- [ ] One-family-per-connection routing is enforced.
- [ ] History load path uses pipeline semantics.
- [ ] No unapproved test rewrites in green.
- [ ] Verification commands pass.

## Handoff Output Contract
Return:
- Files changed
- Story 6 test pass counts
- Negotiation/routing behavior summary
- Any unresolved risks or deferred decisions
