# Prompt Pivot-1: Contracts Update + New Red Tests

## Model Context
Autonomous non-interactive GPT-5.3-Codex execution. Complete the task fully unless blocked.

## Context

**Product:** Liminal Builder — agentic IDE wrapping AI coding CLIs via provider adapters.

**Project:** Epic 02 Provider Architecture + Streaming Pipeline.

**Story:** Story 4 — Claude SDK Provider. This prompt executes an architectural pivot on the Story 4 red phase.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Branch:** `arc-pivot-story-4` (head: `be6f47d`)

**Prerequisites:** Stories 0-3 are green. Story 4 red phase is complete (14 tests committed). This prompt replaces that red phase with a pivoted version.

## The Pivot

The original design had a three-stage pipeline:

```
Provider → StreamEventEnvelope (canonical) → UpsertStreamProcessor → UpsertObject → Browser
```

We are collapsing this to:

```
Provider → UpsertObject/TurnEvent → Browser
```

**What changes:**
1. `CliProvider.onEvent(callback: StreamEventEnvelope)` is replaced by `onUpsert(callback: UpsertObject)` + `onTurn(callback: TurnEvent)`
2. The provider translates SDK events to `UpsertObject`/`TurnEvent` directly — no intermediate canonical event format
3. `claude-event-normalizer.ts` is absorbed into the provider (SDK event type definitions move there; the normalizer class is deleted)
4. `response_error` event type is eliminated — only `TurnEvent` with `type: "turn_error"` represents error terminals
5. The `UpsertStreamProcessor` and `StreamEventEnvelope` schema are NOT deleted in this prompt — that cleanup happens in a later chunk after the provider is green

**What stays the same:**
- SDK adapter boundary (`ClaudeSdkAdapter`, `ClaudeSdkQueryHandle`)
- Session lifecycle methods (createSession, loadSession, sendMessage, cancelTurn, killSession, isAlive)
- `UpsertObject` and `TurnEvent` type definitions (these are already correct in `server/streaming/upsert-types.ts`)
- `ProviderError` codes and class
- Provider skeleton methods throwing `NotImplementedError` (this is a red phase — we're rewriting tests, not implementing behavior)

## Pre-check

Before making any changes, verify branch state:
```bash
git rev-parse HEAD  # must be be6f47d
```

## Files to Read First

Read these files to understand the current state before making changes:

- `server/providers/provider-types.ts` — current CliProvider interface (changing)
- `server/streaming/upsert-types.ts` — UpsertObject/TurnEvent types (the new provider output contract)
- `server/providers/claude/claude-sdk-provider.ts` — current provider skeleton (changing)
- `server/providers/claude/claude-event-normalizer.ts` — SDK event types to absorb, normalizer class to delete
- `server/providers/provider-errors.ts` — ProviderError (unchanged)
- `tests/server/providers/claude-sdk-provider.test.ts` — current 14 red tests (rewriting)
- `tests/server/providers/provider-interface.test.ts` — TC-2.1a/b/c (updating)
- `tests/server/providers/provider-registry.test.ts` — provider double needs interface update
- `tests/helpers/provider-mocks.ts` — shared mock provider factory, implements CliProvider (needs interface update)
- `shared/stream-contracts.ts` — dead re-exports to remove

## Inlined Target Contracts

### CliProvider interface (target state after this prompt)

```typescript
import type { UpsertObject, TurnEvent } from "@server/streaming/upsert-types";

export interface CliProvider {
  readonly cliType: CliType;
  createSession(options: CreateSessionOptions): Promise<ProviderSession>;
  loadSession(sessionId: string, options?: LoadSessionOptions): Promise<ProviderSession>;
  sendMessage(sessionId: string, message: string): Promise<SendMessageResult>;
  cancelTurn(sessionId: string): Promise<void>;
  killSession(sessionId: string): Promise<void>;
  isAlive(sessionId: string): boolean;
  onUpsert(sessionId: string, callback: (upsert: UpsertObject) => void): void;
  onTurn(sessionId: string, callback: (event: TurnEvent) => void): void;
}
```

### UpsertObject types (already exist — do not modify)

```typescript
interface UpsertObjectBase {
  turnId: string;
  sessionId: string;
  itemId: string;             // format: ${turnId}:${messageOrdinal}:${blockIndex}
  sourceTimestamp: string;     // ISO 8601 — when SDK event arrived
  emittedAt: string;           // ISO 8601 — when provider emits this upsert
  status: "create" | "update" | "complete" | "error";
  errorCode?: string;
  errorMessage?: string;
}

interface MessageUpsert extends UpsertObjectBase {
  type: "message";
  content: string;             // accumulated, not delta
  origin: "user" | "agent" | "system";
}

interface ThinkingUpsert extends UpsertObjectBase {
  type: "thinking";
  content: string;             // accumulated
  providerId: string;
}

interface ToolCallUpsert extends UpsertObjectBase {
  type: "tool_call";
  toolName: string;
  toolArguments: Record<string, unknown>;  // may be partial/empty on create
  callId: string;
  toolOutput?: string;
  toolOutputIsError?: boolean;
}

type UpsertObject = MessageUpsert | ThinkingUpsert | ToolCallUpsert;
```

### TurnEvent types (already exist — do not modify)

```typescript
type TurnEvent =
  | { type: "turn_started"; turnId: string; sessionId: string; modelId: string; providerId: string }
  | { type: "turn_complete"; turnId: string; sessionId: string; status: "completed" | "cancelled"; usage?: { inputTokens: number; outputTokens: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number } }
  | { type: "turn_error"; turnId: string; sessionId: string; errorCode: string; errorMessage: string };
```

### Claude SDK event types (move from normalizer into provider)

```typescript
// These type definitions move from claude-event-normalizer.ts into claude-sdk-provider.ts.
// They represent what the mock SDK adapter emits. No changes to the types themselves.

type ClaudeSdkStreamEvent =
  | ClaudeMessageStartEvent
  | ClaudeMessageDeltaEvent
  | ClaudeMessageStopEvent
  | ClaudeContentBlockStartEvent
  | ClaudeContentBlockDeltaEvent
  | ClaudeContentBlockStopEvent
  | ClaudeUserToolResultEvent;
```

### Provider deps (target state)

```typescript
export interface ClaudeSdkProviderDeps {
  sdk: ClaudeSdkAdapter;
  createSessionId?: () => string;
  createTurnId?: () => string;
  now?: () => string;  // ISO 8601 UTC timestamp factory; defaults to () => new Date().toISOString()
}
```

## File Changes

### 1. `server/providers/provider-types.ts` — MODIFY

- Remove `import type { StreamEventEnvelope }` from `@server/streaming/stream-event-schema`
- Add `import type { UpsertObject, TurnEvent }` from `@server/streaming/upsert-types` (use path alias, matching codebase convention)
- Replace `onEvent` method with `onUpsert` + `onTurn` (see inlined contract above)
- All other types (`CreateSessionOptions`, `LoadSessionOptions`, `ProviderSession`, `SendMessageResult`, `ProviderRegistry`) remain unchanged

### 2. `server/providers/claude/claude-sdk-provider.ts` — MODIFY

- Move all SDK event type definitions (`ClaudeMessageStartEvent`, `ClaudeContentBlockStartEvent`, etc., and the `ClaudeSdkStreamEvent` union) from `claude-event-normalizer.ts` into this file
- Remove all imports from `claude-event-normalizer`
- Remove `ClaudeEventNormalizer` from session state and deps
- Update `ClaudeSdkProviderDeps`: remove `createNormalizer`, add `now?: () => string`
- Update `ClaudeProviderSessionState`: remove `normalizer` field
- Change listener maps from `Map<string, Array<(event: StreamEventEnvelope) => void>>` to two maps:
  - `upsertListeners: Map<string, Array<(upsert: UpsertObject) => void>>`
  - `turnListeners: Map<string, Array<(event: TurnEvent) => void>>`
- Replace `onEvent` method with `onUpsert` and `onTurn` methods that register to the respective listener maps
- Keep all lifecycle methods (`createSession`, `loadSession`, `sendMessage`, `cancelTurn`, `killSession`) still throwing `NotImplementedError` — this is red phase
- Keep `isAlive` implemented as-is

### 3. `server/providers/claude/claude-event-normalizer.ts` — DELETE

All SDK event type definitions have been moved to `claude-sdk-provider.ts`. The `ClaudeEventNormalizer` class is no longer needed.

### 4. `tests/server/providers/claude-sdk-provider.test.ts` — REWRITE

Complete rewrite of all 14 tests. Same TCs, same SDK mock boundary pattern, but assertions target `UpsertObject`/`TurnEvent` instead of `StreamEventEnvelope`.

**Keep unchanged:**
- `createMockSdkBoundary()` helper logic and its `ClaudeSdkStreamEvent` mock sequences (only the import source changes — import `ClaudeSdkStreamEvent` from provider file, not normalizer)
- TC IDs in test names
- SDK event sequences fed to the mock boundary

**Update `createProvider()` helper:**
- Remove `createNormalizer` from deps
- Add `now: () => "2026-02-15T10:00:00.000Z"` for deterministic timestamps in assertions

**Update imports:**
- Remove `StreamEventEnvelope` import
- Import `UpsertObject`, `TurnEvent` from `@server/streaming/upsert-types`
- Import `ClaudeSdkStreamEvent` from provider file (not normalizer)

**Test assertion rewrites by TC:**

**TC-3.1a** (createSession): Change `expect(boundary.query).toHaveBeenCalledTimes(1)` — keep as-is. Lifecycle test, no event assertions needed. Just verify session creation mechanics work.

**TC-3.1b** (loadSession): Same — lifecycle test, no event output assertions.

**TC-3.1c** (creation failure): Same — verifies ProviderError, no event output.

**TC-3.2a** (sendMessage input generator): Same — verifies message delivery through AsyncIterable, no event output.

**TC-3.2b** (sequential sends): Same — verifies ordering, no event output.

**TC-3.3a** (text blocks → message upserts): Register `onUpsert` and `onTurn` callbacks instead of `onEvent`. Assert:
- `turn_started` TurnEvent emitted with turnId and modelId
- At least one `MessageUpsert` with `status: "create"`, `type: "message"`, `origin: "agent"`, `itemId` matching `turn-1:1:0`
- Final `MessageUpsert` with `status: "complete"`, `content` containing `"Hello"`
- `turn_complete` TurnEvent with `status: "completed"` and usage data
- Turn events bracket the upserts (turn_started first, turn_complete last)

**TC-3.3b** (tool-use blocks → tool call upserts): Assert:
- `ToolCallUpsert` with `status: "create"`, `toolName: "read_file"`, `callId: "toolu-1"`, `itemId` matching `turn-1:1:0`
- `ToolCallUpsert` with `status: "complete"`, finalized `toolArguments: { path: "src/a.ts" }`

**TC-3.3c** (tool results → tool output): Assert:
- `ToolCallUpsert` with `status: "complete"`, `toolOutput: '{"ok":true}'`, `toolOutputIsError: false`, `callId: "toolu-1"`

**TC-3.3d** (thinking blocks → thinking upserts): Assert:
- `ThinkingUpsert` with `status: "create"`, `type: "thinking"`, `providerId: "claude-code"`
- Final `ThinkingUpsert` with `status: "complete"`, `content` containing `"Plan first."`, `providerId: "claude-code"`

**TC-3.3e** (interleaved blocks → distinct itemIds): Collect all upserts. Assert:
- Upserts reference at least 2 distinct `itemId` values
- `itemId` values follow deterministic format: `turn-1:1:0` and `turn-1:1:1`
- Text and tool_call upserts have different itemIds

**TC-3.3f** (turn lifecycle + error terminal): Assert:
- `turn_started` TurnEvent before any upserts
- For error terminal: `turn_error` TurnEvent with `errorCode` and `errorMessage` (NOT `turn_complete` with error status)
- No `response_error` concept exists — only `turn_error`

**TC-3.4a** (cancelTurn): Same assertion — `boundary.interrupt` called. No event output changes.

**TC-3.4b** (killSession): Same — `boundary.close` called, `isAlive` returns false.

**TC-3.4c** (isAlive): Same — reflects process state before/after kill.

### 5. `tests/server/providers/provider-interface.test.ts` — MODIFY

**TC-2.1a**: Update `createProviderDouble()`:
- Replace `onEvent` with `onUpsert` + `onTurn` in the manual double
- Remove `StreamEventEnvelope` import
- Import `UpsertObject`, `TurnEvent` from streaming/upsert-types
- Remove `RESPONSE_START_FIXTURE` import (no longer needed)
- Update delivery test: instead of emitting a StreamEventEnvelope, emit an inline `MessageUpsert` via the `onUpsert` callback and verify delivery
- Keep all other method-call and return-value assertions

**TC-2.1b**: Update Claude conformance:
- Remove `StreamEventEnvelope` reference (if any in assertions)
- Provider constructor no longer needs `createNormalizer`
- Replace `expect(typeof provider.onEvent).toBe("function")` with checks for both `onUpsert` and `onTurn`
- TypeScript compilation is the real conformance test — the runtime assertions are secondary

**TC-2.1c**: Keep as `it.todo` — unchanged

### 6. `tests/server/providers/provider-registry.test.ts` — MODIFY

Update `createProviderDouble()`:
- Replace `onEvent` with `onUpsert` + `onTurn` to match new `CliProvider` interface
- Remove `StreamEventEnvelope` import
- The double implementations can be no-ops: `(_sessionId, _callback) => undefined`

### 7. `tests/helpers/provider-mocks.ts` — MODIFY

This file contains `createMockProvider()` — a shared `vi.fn()`-based mock that satisfies `CliProvider`. It currently has `onEvent` typed against `StreamEventEnvelope`. After the interface change, typecheck will fail on this file.

- Remove `StreamEventEnvelope` import from `@server/streaming`
- Import `UpsertObject`, `TurnEvent` from `@server/streaming`
- Replace the `onEvent` property and its type annotation with two properties:
  - `onUpsert: vi.fn<(sessionId: string, callback: (upsert: UpsertObject) => void) => void>()`
  - `onTurn: vi.fn<(sessionId: string, callback: (event: TurnEvent) => void) => void>()`
- Update the return type annotation: replace `onEvent: ReturnType<typeof vi.fn<...>>` with `onUpsert` and `onTurn` equivalents

### 8. `shared/stream-contracts.ts` — MODIFY

Remove dead re-exports that reference the eliminated intermediate format:
- Remove `StreamEventEnvelope`, `StreamEventPayload`, `StreamEventType` type re-exports
- Remove `streamEventEnvelopeSchema`, `streamEventPayloadSchema`, `finalizedItemSchema`, `usageSchema` Zod schema re-exports
- Keep `FinalizedItem` and `Usage` type re-exports (still referenced by processor until Chunk 3 cleanup)
- Keep all `UpsertObject`, `TurnEvent`, and `Ws*Message` exports unchanged

**Important:** `FinalizedItem` and `Usage` are defined in `stream-event-schema.ts` which is NOT being deleted. They remain importable. If removing them from `shared/stream-contracts.ts` causes downstream compile errors, keep them.

## Non-Goals

- No behavior implementation. All provider lifecycle methods (except `isAlive`) keep throwing `NotImplementedError`.
- No deletion of `stream-event-schema.ts`, `upsert-stream-processor.ts`, or their tests — that's Chunk 3.
- No changes to `server/streaming/upsert-types.ts` — the output types are already correct.
- No Session API, registry behavior, websocket, pipeline, or browser changes.
- No batching/gradient implementation — that's the green phase.

## Constraints

- Do NOT modify types in `server/streaming/upsert-types.ts` or `server/streaming/stream-event-schema.ts`. Exception: update the `emittedAt` JSDoc comment in `upsert-types.ts` from "Time the processor emitted this upsert object" to "Time the emitter (provider or processor) produced this upsert object" — the pivot changes who sets this field
- Do NOT delete or modify `tests/server/streaming/upsert-stream-processor.test.ts` or `tests/server/contracts/stream-contracts.test.ts`
- Do NOT modify `tests/fixtures/stream-events.ts` — it's still used by Story 0-2 tests
- Do NOT add new dependencies
- Every test name must keep its TC ID prefix
- Keep the same `createMockSdkBoundary` pattern — mock only at the SDK adapter boundary
- Maintain exactly 14 tests in `claude-sdk-provider.test.ts` covering the same TCs

## If Blocked or Uncertain

- If changing `CliProvider` causes compile errors in files outside the scoped list, fix the mechanical breakage (e.g., replacing `onEvent` with `onUpsert`/`onTurn` in a provider double) and report what you changed
- If a TC's behavioral intent is unclear given the pivot, stop and describe what you think the test should assert
- If `shared/stream-contracts.ts` cleanup causes downstream failures, leave `shared/stream-contracts.ts` changes as minimal as needed for compilation
- Do NOT silently drop TCs or weaken assertion intent

## Verification

When complete, run in this order:

1. `bun run red-verify` — must pass (format, lint, typecheck — no test execution)
2. `bun run test -- tests/server/providers/provider-registry.test.ts` — must still pass (registry stubs are green from Story 3)
3. `bun run test -- tests/server/contracts/stream-contracts.test.ts` — must still pass (Story 0 contract tests untouched)
4. `bun run test -- tests/server/streaming/upsert-stream-processor.test.ts` — must still pass (Story 2 processor tests untouched)
5. `bun run test -- tests/server/providers/claude-sdk-provider.test.ts` — all 14 tests should FAIL (red) because provider methods throw NotImplementedError

6. Run `rg "onEvent|StreamEventEnvelope" --type ts server/ shared/ tests/` — no matches should appear in provider-types, claude-sdk-provider, provider-interface.test, provider-registry.test, or provider-mocks. Matches in `stream-event-schema.ts`, `upsert-stream-processor.ts`, `stream-events.ts` (fixtures), and `acp-client.ts`/`session-manager.ts`/`websocket.test.ts` are expected (those files are out of scope for this prompt).

Expected state: everything compiles and lints, Stories 0-3 tests remain green, Story 4 tests are red.

## Done When

- [ ] `CliProvider` interface uses `onUpsert`/`onTurn` — no `StreamEventEnvelope` reference remains in provider-types
- [ ] `claude-event-normalizer.ts` is deleted; SDK event types live in `claude-sdk-provider.ts`
- [ ] `claude-sdk-provider.ts` has two listener maps (upsert + turn) and two registration methods
- [ ] `ClaudeSdkProviderDeps` has `now` factory, no `createNormalizer`
- [ ] `claude-sdk-provider.test.ts` has exactly 14 tests with TC IDs, asserting `UpsertObject`/`TurnEvent` output
- [ ] `provider-interface.test.ts` TC-2.1a/b updated for new interface; TC-2.1c still `.todo`
- [ ] `provider-registry.test.ts` provider double compiles against new interface
- [ ] `tests/helpers/provider-mocks.ts` `createMockProvider()` uses `onUpsert`/`onTurn` (no `onEvent`)
- [ ] `shared/stream-contracts.ts` has no `StreamEventEnvelope`/schema re-exports (or minimal if needed for compilation)
- [ ] `bun run red-verify` passes
- [ ] Story 0-3 test suites remain green (no regressions)
- [ ] All 14 Story 4 tests fail due to `NotImplementedError`, not due to compile errors or bad setup

## Handoff Output Contract

Return:
- Files changed/deleted (list)
- Count of Story 4 tests (should be 14)
- Red-verify result
- Any Story 0-3 regressions found
- Any blockers or deferred decisions
