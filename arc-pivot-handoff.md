# Arc Pivot Story 4: Handoff Document

## Your Role

You are the planning and orchestration layer for an architectural pivot on the Liminal Builder project. You will:

1. Read the referenced documents to understand current architecture and contracts
2. Plan implementation chunks for the pivot
3. Generate execution prompts for GPT-5.3 Codex (you have the `gpt53-codex-prompting` skill)
4. Validate execution results using the `senior-engineer` subagent
5. Work interactively with the user to assess and course-correct

## User Communication Preferences

The user is a senior systems designer with 30 years of experience. Strong preferences:

- **Decision presentation format:** Problem → Cause → Options → Recommendation + reasoning. No other format.
- **No internal labels or IDs** (like TC-2.1b) unless the user asks. Describe things by what they do, not by their tracking ID.
- **No file path noise** unless the user asks. Reference behavior, not filenames.
- **No performative humility, soothing, or boilerplate.** Be direct.
- **Frustration is diagnostic.** If the user pushes back, they're refining the model, not attacking. Diagnose, don't soothe.
- **When something goes wrong:** explain your reasoning first, then ask if they want it changed. "Why did you do X" is a question, not an instruction to undo X.
- **Pushback means hold your ground** if your reasoning is sound. Update if it's not. Don't collapse.

## Product: Liminal Builder

An agentic IDE that wraps AI coding CLIs (Claude Code, Codex, future others) via provider adapters. Fastify + WebSocket server, vanilla JS browser client. Each CLI gets a provider that manages session lifecycle and streams responses to the browser.

**Working directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Project: Epic 02 — Provider Architecture + Streaming Pipeline

Replaces the current ACP-centric streaming bridge with a provider architecture where each CLI has its own provider. The epic covers: provider contracts, streaming processing, Claude provider, Codex provider, pipeline integration, browser migration, and end-to-end verification.

**Epic docs (read these first):**
- Tech design: `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- Feature spec: `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- Test plan: `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- Implementation decisions log: `docs/epics/02-provider-streaming-pipeline/implementation-decisions-log.md`

**Important:** The implementation decisions log contains Decision 002 (dual error types with `response_error` + `response_done(error)`). This decision is **superseded** by the pivot — `response_error` is eliminated entirely. Only `response_done(status: "error", error: {code, message})` survives.

**Story 4 docs:**
- Story: `docs/epics/02-provider-streaming-pipeline/stories/story-4-claude-provider/story.md`
- Prompts: `prompt-4.1-skeleton-red.md`, `prompt-4.2-green.md`, `prompt-4.R-verify.md` (same directory)
- The skeleton-red prompt (`prompt-4.1-skeleton-red.md`) is a good example of the expected detail level for GPT-5.3 Codex execution prompts — inlined contracts, explicit TC expectations, file scope, verification steps, done-when checklist.

## Claude Agent SDK Reference

The Claude provider wraps Anthropic's Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`).

**SDK reference doc:** `docs/reference/claude-agent-sdk-reference.md` — read this for the real SDK API shape.

**Key SDK concepts for provider implementation:**
- `query()` starts a persistent session. It takes an `AsyncIterable<SDKUserMessage>` as input (the "input generator") and returns an `AsyncIterable` of SDK stream events as output.
- The input generator is long-lived — you yield messages into it over time, one per `sendMessage()` call. You do NOT call `query()` per message.
- `interrupt()` cancels the current turn.
- `close()` terminates the session/subprocess.
- Stream events include: message lifecycle (`message_start`, `message_delta`, `message_stop`), content blocks (`content_block_start`, `content_block_delta`, `content_block_stop`), and user tool results.
- The real SDK event types are richer/more wrapped than simplified internal types. The provider's job is to translate these internally.

## TDD Workflow Methodology (liminal-spec)

This project uses a spec-driven TDD methodology with three phases per story:

1. **Skeleton-Red:** Write test skeletons with real behavioral assertions. All tests should fail because behavior is unimplemented (not because of bad setup or missing types). Provider/module skeletons exist but throw `NotImplementedError`. Run `bun run red-verify` (compiles, lints, but tests fail).

2. **Green:** Implement real behavior to make red tests pass without modifying test files. Run `bun run green-verify` (everything passes + guard confirms no test changes).

3. **Verify:** Audit coverage, fidelity, and regression safety. Run `bun run verify-all`.

**Test baseline system:** `bun run guard:test-baseline-record` records which tests exist and their pass/fail state. After deleting tests (Phase 3 cleanup), the baseline must be re-recorded or the guards will fail.

## Current State

- **Branch:** `arc-pivot-story-4` (branched from `master` at `be6f47d`)
- **Stories 0-3:** Complete and green
- **Story 4 red phase:** Complete — skeleton provider, normalizer, 14 red tests committed
- **Story 4 green phase:** NOT started — this is where the pivot happens

### What exists right now (Story 4 red output):

| File | Purpose |
|------|---------|
| `server/providers/claude/claude-sdk-provider.ts` | Provider skeleton implementing `CliProvider`. All methods except `isAlive` and `onEvent` throw `NotImplementedError`. Defines `ClaudeSdkAdapter` boundary with `query()` → `ClaudeSdkQueryHandle` (output stream + interrupt + close + isAlive). |
| `server/providers/claude/claude-event-normalizer.ts` | Event translation skeleton. Defines Claude SDK event types (`ClaudeSdkStreamEvent` union). All methods throw `NotImplementedError`. **Will be merged into provider and deleted.** |
| `tests/server/providers/claude-sdk-provider.test.ts` | 14 red tests covering session lifecycle, message sending, event normalization, cancel/kill. **Assertions currently expect `StreamEventEnvelope` output — must be rewritten to expect `UpsertObject`.** |
| `tests/server/providers/provider-interface.test.ts` | TC-2.1b activated (Claude conformance), TC-2.1c deferred (Codex). |
| `server/providers/provider-registry.ts` | Registry stub from Story 3 |
| `server/api/session/session-service.ts` | Session service stub from Story 3 |
| `server/api/session/routes.ts` | Route stub from Story 3 |

### What also exists (from earlier stories):

| File | Purpose | Pivot impact |
|------|---------|--------------|
| `server/streaming/stream-event-schema.ts` | Zod schemas for `StreamEventEnvelope` | **Delete after pivot is working** |
| `server/streaming/upsert-types.ts` | `UpsertObject` types: `MessageUpsert`, `ThinkingUpsert`, `ToolCallUpsert`, `TurnEvent` | **Survives — this becomes the provider output contract** |
| `server/streaming/upsert-stream-processor.ts` | ~550 lines. Consumes `StreamEventEnvelope`, emits `UpsertObject`. Handles batching gradient, tool correlation, cancellation, terminal cleanup. | **Delete after pivot is working. Draw from it for utility patterns.** |
| `server/providers/provider-types.ts` | `CliProvider` interface, `ProviderSession`, `SendMessageResult`, etc. | **`onEvent` signature changes (see open design question below)** |
| `server/providers/provider-errors.ts` | `ProviderError` class with typed error codes | **Unchanged** |
| `shared/stream-contracts.ts` | Re-exports streaming types for browser consumption | **Must be updated — currently re-exports `StreamEventEnvelope` types that are being eliminated. Should re-export `UpsertObject`/`TurnEvent` types instead.** |
| `tests/server/streaming/upsert-stream-processor.test.ts` | Tests for the processor | **Delete with the processor** |
| `tests/server/contracts/stream-contracts.test.ts` | Tests for StreamEventEnvelope schema | **Delete with the schema** |

## The Architectural Pivot

### What's changing and why

The current tech design has a three-stage pipeline:

```
Provider → StreamEventEnvelope (canonical) → UpsertStreamProcessor → UpsertObject → Browser
```

We are collapsing this to:

```
Provider → UpsertObject → Browser
```

**Why:**

1. **The intermediate format assumes providers are "the same thing with different event names." They're not.** Different CLIs have genuinely different semantics — OpenAI thinking works completely differently from Anthropic thinking, memory traces vs thinking blocks, etc. Forcing all providers through one canonical event shape will accumulate shims and compatibility hacks.

2. **Copy-paste problems are preferable to coupling problems.** Each provider owning its full translation pipeline (SDK events → upserts) means provider-specific weirdness stays contained. Fixing Codex thinking won't risk breaking Claude thinking.

3. **The gradient/batching logic is not complex enough to justify a whole extra pipeline stage and intermediate format.** The actual gradient is ~30 lines of config-driven threshold logic. The state management (buffering, timers, tool correlation) is ~500 lines but provider-agnostic patterns that can be extracted as utility functions later once we have 3-4 providers and can see what's truly shared.

4. **No backward compatibility concern.** This is a brand new app with no users. The "backward compatibility" hedges in the current design are premature tech debt.

### Specific changes

1. **Providers emit `UpsertObject` and `TurnEvent` directly** — not `StreamEventEnvelope`
2. **`CliProvider.onEvent` callback type changes** — from `StreamEventEnvelope` to upsert/turn callbacks (see open design question)
3. **`claude-event-normalizer.ts` merges into `claude-sdk-provider.ts`** — event translation becomes internal to the provider, not a separate module
4. **`response_error` event type is eliminated** — just use `response_done(status: "error", error: {code, message})`
5. **`UpsertStreamProcessor` is deleted** — after pivot is working and verified
6. **`StreamEventEnvelope` schema is deleted** — same
7. **`shared/stream-contracts.ts` is updated** — re-exports change from StreamEventEnvelope types to UpsertObject/TurnEvent types
8. **Batching/gradient logic is copied into the provider** — can be extracted as shared utilities later when patterns emerge across multiple providers

### Open design question: `onEvent` signature

The current `CliProvider` interface has:
```typescript
onEvent(sessionId: string, callback: (event: StreamEventEnvelope) => void): void;
```

This needs to change since providers now emit `UpsertObject` and `TurnEvent` instead of `StreamEventEnvelope`. Options to present to the user:

- **Two separate callbacks:** `onUpsert(sessionId, callback)` + `onTurn(sessionId, callback)`
- **One callback with a union type:** `onEvent(sessionId, callback: (event: UpsertObject | TurnEvent) => void)`
- **Deps-style injection:** Provider constructor takes `onUpsert` and `onTurn` handlers

This is a design decision that should be presented to the user before implementation.

### Timestamp ownership

Previously: `StreamEventEnvelope.timestamp` was the provider/source event time, `UpsertObject.sourceTimestamp` derived from it, and `UpsertObject.emittedAt` was processor emission time.

After the pivot: the provider owns both timestamps directly. `sourceTimestamp` is when the SDK event arrived, `emittedAt` is when the provider emits the upsert (after batching/accumulation). This distinction still matters for debugging latency.

### Decisions already made

| Decision | Resolution |
|----------|-----------|
| Claude conformance test (TC-2.1b) | Split into type-only conformance (passes now) + runtime behavior (stays red until implementation works) |
| SDK event translation boundary | Provider translates raw SDK events internally; no separate normalizer module |
| Adapter termination naming | Renamed `kill()` to `close()` on `ClaudeSdkQueryHandle` to match real Claude Agent SDK (already committed) |
| Error terminal emission | Drop `response_error` entirely. Use only `response_done(status: "error", error: {code, message})` |
| Item ID strictness | Assert deterministic format `${turnId}:${messageOrdinal}:${blockIndex}` strictly in tests |

## What Needs to Happen

### Phase 1: Implement the pivot (get Claude provider working with upsert output)

1. Resolve `onEvent` signature design question with user
2. Update `CliProvider` interface — change event callback to emit upserts/turn events
3. Update `claude-sdk-provider.ts` — absorb event translation + batching logic, emit `UpsertObject` directly
4. Update Story 4 red tests — assertions should expect `UpsertObject` output, not `StreamEventEnvelope`
5. Implement green (make tests pass) — real Claude SDK adapter integration, event translation, batching
6. Split TC-2.1b into type-only + runtime tests
7. Update `shared/stream-contracts.ts` — re-export new types

### Phase 2: Harden and assess

8. Run full test suite, verify no regressions in Stories 0-3
9. Assess test coverage — are we testing the right behaviors?
10. Integration testing if applicable

### Phase 3: Clean up dead code

11. Delete `upsert-stream-processor.ts` and its tests
12. Delete `stream-event-schema.ts` (or strip down to only what's still referenced)
13. Delete `claude-event-normalizer.ts` (already merged into provider)
14. Delete `tests/server/contracts/stream-contracts.test.ts`
15. Remove `response_error` from any remaining schemas/types
16. Clean up imports and references
17. **Re-record test baseline** with `bun run guard:test-baseline-record` (deleting tests changes the baseline)

### Phase 4: Update docs

18. Update tech design to reflect new architecture
19. Update test plan
20. Update story docs and prompts for Stories 5-7 (they depend on Story 4's output shape — the pivot changes what providers emit, which cascades to how Stories 5-7 are structured)

## Known Failure Modes to Guard Against

These were identified during the Story 4 red phase and should be encoded into execution prompts:

1. **Models optimizing for "tests pass" instead of TDD assertion quality.** In red phase, models drift toward writing assertions that are easy to satisfy rather than assertions that encode the actual behavioral contract. Guard: every test should have a one-sentence description of what user-visible behavior it proves. If you can't state it, don't write the test.

2. **Low-value assertions.** Things like `expect(typeof provider.createSession).toBe("function")` — TypeScript already enforces this. Ban method-existence checks and constant-echo assertions. Every assertion should catch a real regression.

3. **Missing high-signal contract assertions.** In the initial red phase, these were missing and had to be added:
   - Event ordering (response_start before item events)
   - Stable item IDs across start/delta/done for the same block
   - Function-call start includes tool name and call ID
   - Function-call done uses finalized arguments (not partial deltas)
   - Cancelled turns don't end as successful completion
   - Error terminal semantics match contract

4. **Ambiguous test intent.** If a test name says "no type errors" but the test body calls runtime methods, the intent is unclear. Be explicit about whether a test is compile-time conformance or runtime behavior.

5. **Over-engineering compatibility layers.** This is a new app with no users. Do not add backward-compatibility shims, dual-format support, or migration paths unless explicitly requested.

## Key Contracts (still valid after pivot)

### UpsertObject types (the provider output contract — in `server/streaming/upsert-types.ts`)

Read this file. These are what providers emit directly. Key types:
- `MessageUpsert` — text content with status lifecycle (create → update → complete)
- `ThinkingUpsert` — reasoning/thinking content
- `ToolCallUpsert` — tool invocation with name, arguments, callId, output
- `TurnEvent` — turn lifecycle (turn_started, turn_complete, turn_error)

### CliProvider interface (in `server/providers/provider-types.ts`)

Read this file. The `onEvent` signature needs to change (see open design question above).

### Provider errors (in `server/providers/provider-errors.ts`)

Unchanged. `ProviderError` with typed codes: `SESSION_NOT_FOUND`, `PROCESS_CRASH`, `PROTOCOL_ERROR`, `INVALID_STREAM_EVENT`, `INTERRUPT_FAILED`, `SESSION_CREATE_FAILED`.

## Execution Model

- **Planning/orchestration:** You (Opus), interactively with the user
- **Code execution:** GPT-5.3 Codex via prompts you generate (use `gpt53-codex-prompting` skill)
- **Validation:** `senior-engineer` subagent for test runs, type checking, quality gates
- **User role:** Reviews plans, makes decisions at forks, approves direction

### Prompt generation guidance

The skeleton-red prompt at `prompt-4.1-skeleton-red.md` is the reference example for execution prompt quality. Key characteristics:
- Inlined contract snapshots (don't make the model go read 5 files)
- Explicit file scope (exactly which files to create/modify)
- Explicit test expectations with behavioral descriptions
- Verification steps with expected outcomes
- Done-when checklist
- "If blocked or uncertain" escape hatch instructions
- Non-goals to prevent scope creep

## Verification Commands

```bash
bun run red-verify          # Format + lint + typecheck (no test run)
bun run verify              # Format + lint + typecheck + test
bun run green-verify        # verify + guard:no-test-changes
bun run test                # Run all tests
bun run guard:test-baseline-record  # Record test baseline
```

**Important:** After Phase 3 cleanup (deleting dead tests), you must run `bun run guard:test-baseline-record` to update the baseline. Otherwise the guard will fail because it expects tests that no longer exist.

## Workspace Context

This is a Bun workspace monorepo at `/Users/leemoore/liminal`. The builder app is at `apps/liminal-builder`. Use `bun` for all package/test/build operations. Biome for formatting/linting, Vitest for testing, TypeScript strict mode.

## Story Dependency Note

Stories 5-7 in the epic depend on Story 4's output:
- **Story 5 (Codex provider):** Will follow the same pattern — provider emits upserts directly, no normalizer. The current Story 5 prompts reference `StreamEventEnvelope` and `codex-event-normalizer.ts` and will need to be rewritten after the pivot.
- **Story 6 (Pipeline + browser migration):** The pipeline is now simpler (no processor stage to wire). Browser migration still applies but consumes upserts directly from providers.
- **Story 7 (E2E + cleanup):** Scope may shrink since there's less pipeline wiring to verify.

These doc updates happen in Phase 4, after the pivot is working.
