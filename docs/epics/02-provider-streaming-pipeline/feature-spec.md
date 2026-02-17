# Epic: Provider Architecture + Streaming Pipeline

This epic defines the complete requirements for replacing Liminal Builder's ACP-centric streaming path with a layered provider architecture and upsert streaming pipeline. It serves as the source of truth for the Tech Lead's design work.

This is a technical refactoring epic. From the user's perspective, nothing changes — same UI, same chat, same session management. The value is structural: cleaner architecture, faster Claude Code session loads, deterministic streaming contracts, and the foundation for Redis fan-out and Context integration.

---

## System Profile

**Primary Consumer:** Builder's session module and browser client
**Context:** The session module coordinates CLI providers and delivers rendered objects to the browser from provider callback outputs (`onUpsert`, `onTurn`). Canonical stream envelopes and the upsert processor remain available for compatibility paths that still require envelope-to-upsert transformation.
**Mental Model:** "I call a provider, it gives me upserts/turn events. I push them to the browser, it renders by replacing state per item. Canonical event envelopes remain available for compatibility paths that still use the processor."
**Key Constraint:** The existing ACP integration works. This epic replaces its internals without changing external behavior. Both Claude Code and Codex must continue functioning throughout. The browser client should require minimal changes.

---

## Architecture Overview

Today, Builder talks to CLIs through a single ACP client (`server/acp/acp-client.ts`, ~810 lines). ACP notifications are translated to `ChatEntry` objects and pushed to the browser via WebSocket. There is no provider abstraction — ACP is hardcoded. Claude Code and Codex both go through the same ACP path, and Builder currently keeps one ACP process alive per CLI type.

After this epic, the ACP client is replaced by a provider registry with purpose-built providers per CLI type. Claude Code uses the SDK directly (persistent subprocess, no per-load cold start). Codex uses the ACP adapter behind the provider interface. Both providers emit `UpsertObject` and `TurnEvent` outputs through provider callbacks. Canonical stream-event envelopes remain as compatibility/processor input contracts where needed. The pipeline is ready for Redis insertion (next epic) without architectural changes.

The key architectural shift: **streaming events become first-class data objects** rather than ad-hoc translations of ACP notifications. Every event has a defined schema, lifecycle, and consumption contract.

Reference: `docs/architecture.md` (workspace root) for full cross-domain architecture.

---

## Scope

### In Scope

This epic delivers the internal streaming infrastructure that all future capabilities build on:

- Canonical stream event format (Zod schema defining the compatibility event vocabulary for envelope-based paths)
- Provider interface (the contract every CLI provider implements)
- Claude Code provider using V1 SDK `query()` with streaming input mode
- Codex provider refactored from existing ACP code behind the provider interface
- Upsert stream processor ported from cody-fastify prior art (batching, gradient, tool call correlation)
- Session API module (`/api/session/*` routes) coordinating providers and lifecycle
- Browser client updated to consume upsert objects instead of ChatEntry
- Pipeline integration wiring providers → WebSocket delivery (with processor path retained for compatibility sources)

### Out of Scope

- Redis Streams integration (Phase 2 — Combined Epic)
- Persistence consumer / Context integration (Phase 2)
- Browser reconnection via stream cursors (requires Redis)
- Context API calls from Builder (Context Epic 1 runs in parallel but integration is Phase 2)
- New UI features, visual changes, or UX improvements (this is plumbing)
- Codex migration to app-server (Phase 4 — separate epic)
- In-process MCP tool injection via `createSdkMcpServer()` (wiring prepared but tools not defined until Context/LiminalDB integration)
- Session management intelligence (curation profiles, trigger tracking, swap orchestration) — deferred to Phase 2+
- LiminalDB integration
- Gemini CLI, Cursor, or Copilot support

### Assumptions

| ID | Assumption | Status | Notes |
|----|------------|--------|-------|
| A1 | Claude Agent SDK V1 `query()` with `AsyncIterable<SDKUserMessage>` streaming input keeps one subprocess alive across multiple turns | Unvalidated | Core assumption — Story 4 validates this |
| A2 | SDK `includePartialMessages: true` streams `SDKPartialAssistantMessage` events wrapping raw Anthropic API events | Validated | Confirmed in SDK docs and reference |
| A3 | Existing Codex ACP behavior can be preserved while refactoring behind the provider interface | High confidence | Mechanical refactor, not behavioral change |
| A4 | The cody-fastify upsert stream processor can be ported with input type adaptation | High confidence | 20 fixture-driven tests provide regression safety |
| A5 | Browser client changes are minimal — replacing ChatEntry consumption with upsert object consumption | Unvalidated | Depends on how tightly coupled the rendering is to ChatEntry shape |
| A6 | `@anthropic-ai/claude-agent-sdk` is installed as a dependency of Builder | Unvalidated | Currently a transitive dependency via claude-code-acp; needs direct installation |

---

## Contracts & Requirements

### Primary vs Compatibility Streaming Paths

- Primary path: providers emit `UpsertObject` and `TurnEvent` through `onUpsert` / `onTurn`, and these outputs flow to session/delivery.
- Compatibility path: canonical stream event envelopes flow through the upsert processor for sources that still produce envelopes.
- Guardrail: provider implementations are not required to emit canonical envelopes at the provider interface boundary.

### 1. Canonical Stream Event Format

The canonical stream event format is a compatibility vocabulary for sources that feed the upsert processor directly. Provider implementations may emit upsert/turn callbacks directly instead of exposing canonical envelopes at the provider interface boundary.

The format is distinct from Context's canonical entry types. Stream events represent in-flight data (`item_start`, `item_delta`, `item_done`). Canonical entries represent completed, persisted data. The upsert processor bridges them — a completed upsert object maps to what will eventually become a canonical entry.

Story 0 also establishes Phase 1/Phase 2 contract compatibility at the boundary level: completed upsert objects and turn metadata must preserve enough information for Phase 2 ingestion into Context's canonical contract. This epic does not define the field-by-field transformation algorithm; that belongs in Phase 2 Tech Design.

#### Acceptance Criteria

**AC-1.1:** A Zod-validated canonical stream event schema exists that can represent all event types from both Claude Code SDK and Codex ACP

- **TC-1.1a: Schema covers text streaming**
  - Given: A stream event payload representing text content
  - When: Validated against the schema
  - Then: Validates successfully with type `item_delta`, `itemType` `message`, and string delta content

- **TC-1.1b: Schema covers tool call lifecycle**
  - Given: Stream events for tool call start, argument accumulation, and completion with result
  - When: Each is validated against the schema
  - Then: All validate successfully with appropriate types (`item_start` with `function_call`, `item_delta`, `item_done`) and include tool name, call ID, and argument/result fields

- **TC-1.1c: Schema covers thinking/reasoning blocks**
  - Given: A stream event representing thinking content
  - When: Validated against the schema
  - Then: Validates successfully with `itemType` `reasoning` and string content

- **TC-1.1d: Schema covers turn lifecycle**
  - Given: Stream events for response start and response completion
  - When: Validated against the schema
  - Then: `response_start` includes `turnId` and `modelId`; `response_done` includes `status`, `usage`, and `finishReason`, and when `status` is `error` it may include structured `error` details

- **TC-1.1e: Schema covers error events**
  - Given: Stream events for item-level and response-level errors
  - When: Validated against the schema
  - Then: `item_error` includes `itemId`, error code and message; `response_error` includes error code and message

- **TC-1.1f: Schema rejects malformed events**
  - Given: An event payload missing required fields or with wrong types
  - When: Validated against the schema
  - Then: Zod validation fails with descriptive error

**AC-1.2:** The stream event format includes correlation IDs for request/response matching and item tracking

- **TC-1.2a: Turn correlation**
  - Given: All events within a single agent turn
  - When: Inspected
  - Then: All share the same `turnId`

- **TC-1.2b: Item correlation**
  - Given: Events for a single content item (start → deltas → done)
  - When: Inspected
  - Then: All share the same `itemId`

- **TC-1.2c: Tool call correlation**
  - Given: A tool call invocation event and its corresponding result event
  - When: Inspected
  - Then: Both reference the same `callId` for correlation

**AC-1.3:** Phase 1 contracts preserve data required for Phase 2 Context ingestion

- **TC-1.3a: Contract schemas preserve provenance and ordering context**
  - Given: Story 0 contract schemas for canonical stream events and processor outputs
  - When: Inspected
  - Then: They define stable session/turn/item/tool correlation identifiers and timestamp provenance (`sourceTimestamp`, `emittedAt`) needed for downstream ingestion

- **TC-1.3b: Phase 2 derivation boundary is explicit**
  - Given: Story 0 contract documentation
  - When: Reviewed against Context's ingestion request shape
  - Then: It explicitly identifies that `turnSequenceNumber`, `llmTurnNumber`, and canonical `entryType` derivation are resolved in Phase 2 Tech Design, not implemented in this epic

---

### 2. Provider Interface

The provider interface defines the contract that every CLI provider implements. The session module programs against this interface — it never knows which CLI it's coordinating.

#### Acceptance Criteria

**AC-2.1:** A typed provider interface exists that both Claude Code and Codex providers implement

- **TC-2.1a: Interface defines all lifecycle methods**
  - Given: The provider interface type definition
  - When: Inspected
  - Then: It includes `createSession`, `sendMessage`, `loadSession`, `cancelTurn`, `killSession`, `isAlive`, `onUpsert`, and `onTurn`

- **TC-2.1b: Claude Code provider satisfies the interface**
  - Given: The Claude Code provider implementation
  - When: Type-checked
  - Then: It satisfies the provider interface with no type errors

- **TC-2.1c: Codex provider satisfies the interface**
  - Given: The Codex provider implementation
  - When: Type-checked
  - Then: It satisfies the provider interface with no type errors

**AC-2.2:** A provider registry maps CLI types to provider instances

- **TC-2.2a: Registry resolves by CLI type**
  - Given: Providers registered for `claude-code` and `codex`
  - When: The registry is queried for `claude-code`
  - Then: The Claude Code provider instance is returned

- **TC-2.2b: Registry returns error for unknown CLI type**
  - Given: No provider registered for `gemini`
  - When: The registry is queried for `gemini`
  - Then: An error is returned indicating the CLI type is not supported

---

### 3. Claude Code SDK Provider

The Claude Code provider replaces the ACP path for Claude Code sessions with a direct SDK integration. It uses V1 `query()` with streaming input to maintain a persistent subprocess per session.

This is the highest-risk story. The SDK streaming model is different from ACP — raw Anthropic API events require state management for content block correlation and tool call lifecycle tracking.

#### Acceptance Criteria

**AC-3.1:** The provider creates and loads Claude Code sessions via SDK `query()` with streaming input

- **TC-3.1a: Session creation spawns a persistent subprocess**
  - Given: A session creation request with a project directory
  - When: `createSession` is called
  - Then: A Claude Code subprocess is spawned via SDK `query()` and remains alive after the call returns

- **TC-3.1b: Session load restores existing session context**
  - Given: A session ID for an existing session with a JSONL file on disk
  - When: `loadSession` is called
  - Then: The subprocess loads the session context from the file (using provider-specific resume mechanics under the hood)

- **TC-3.1c: Session creation failure is reported**
  - Given: An invalid project directory or missing SDK
  - When: `createSession` is called
  - Then: An error is returned with a descriptive message; no subprocess is left orphaned

**AC-3.2:** The provider sends user messages through the SDK streaming input generator

- **TC-3.2a: User message is delivered to the subprocess**
  - Given: An active session with a running subprocess
  - When: `sendMessage` is called with text content
  - Then: The message is yielded into the SDK's `AsyncIterable<SDKUserMessage>`, the subprocess begins processing, and `sendMessage` resolves after deterministic turn-start binding (not turn completion)

- **TC-3.2b: Multiple sequential messages are delivered in order**
  - Given: An active session
  - When: Two messages are sent sequentially (second after first turn completes)
  - Then: Both are processed in order by the same subprocess without restart

- **TC-3.2c: Send rejects when process is already dead**
  - Given: A session whose underlying process/handle is no longer alive
  - When: `sendMessage` is called
  - Then: The call fails with `PROCESS_CRASH` (or equivalent structured provider error) and does not return a fake-success `{ turnId }`

**AC-3.3:** The provider translates SDK streaming events to upsert and turn outputs

- **TC-3.3a: Text content blocks map to message events**
  - Given: The SDK emits `content_block_start` (type: text), followed by `content_block_delta` (text_delta), followed by `content_block_stop`
  - When: The provider processes these events
  - Then: `message` upsert emissions are produced with create/update/complete lifecycle and correct accumulated content

- **TC-3.3b: Tool use blocks map to function call events**
  - Given: The SDK emits `content_block_start` (type: tool_use) with tool name and ID, followed by `content_block_delta` (input_json_delta) with partial JSON, followed by `content_block_stop`
  - When: The provider processes these events
  - Then: `tool_call` upsert create/complete emissions are produced with tool name/call ID and parsed arguments (argument completeness is authoritative at complete)

- **TC-3.3c: Tool results from SDK user messages map to function call output events**
  - Given: The SDK emits an `SDKUserMessage` containing a tool result for a previous tool call
  - When: The provider processes this event
  - Then: A `tool_call` completion output emission is produced with result content and original `callId` for correlation

- **TC-3.3d: Thinking blocks map to reasoning events (when available)**
  - Given: The SDK emits a complete `SDKAssistantMessage` containing thinking content blocks
  - When: The provider processes the message
  - Then: `thinking` upsert emissions are produced with the thinking text

- **TC-3.3e: Multiple content blocks in a single response are handled**
  - Given: The SDK streams a response containing interleaved text and tool_use content blocks
  - When: The provider processes the events
  - Then: Each content block is tracked independently by block index, and emitted upserts use distinct `itemId`s for each block

- **TC-3.3f: Message completion maps to response lifecycle events**
  - Given: The SDK emits `message_start`, content blocks, `message_delta` (with stop_reason and usage), and `message_stop`
  - When: The provider processes these events
  - Then: `turn_started` is emitted at the beginning with model info, and terminal `turn_complete` or `turn_error` is emitted at the end with structured error details for failure states

- **TC-3.3g: Unknown tool result IDs are handled defensively**
  - Given: The SDK emits `user_tool_result` with a `toolUseId` that has no known prior tool invocation
  - When: The provider processes this event
  - Then: The provider does not crash and emits a defensive `tool_call` completion upsert with `callId`, `toolOutput`, and `toolOutputIsError`

**AC-3.4:** The provider handles session lifecycle operations

- **TC-3.4a: Cancel interrupts the current turn**
  - Given: An active session with a turn in progress
  - When: `cancelTurn` is called
  - Then: The SDK's `interrupt()` method is called and the turn ends with a cancelled status

- **TC-3.4b: Kill terminates the subprocess**
  - Given: An active session with a running subprocess
  - When: `killSession` is called
  - Then: The subprocess is terminated and `isAlive` returns false

- **TC-3.4c: isAlive reflects subprocess state**
  - Given: A session that has been created
  - When: `isAlive` is called before and after kill
  - Then: Returns true before kill, false after

---

### 4. Codex ACP Provider Refactor

The Codex provider extracts the existing ACP client code into the provider interface. Existing Codex behavior is preserved — this is a reorganization, not a rewrite.

#### Acceptance Criteria

**AC-4.1:** Existing ACP code is extracted behind the provider interface without behavior change

- **TC-4.1a: Codex session creation works as before**
  - Given: A Codex session creation request
  - When: `createSession` is called on the Codex provider
  - Then: The ACP `session/new` flow executes and returns a session handle

- **TC-4.1b: Codex session loading works as before**
  - Given: An existing Codex session ID
  - When: `loadSession` is called on the Codex provider
  - Then: The ACP `session/load` flow executes and replays history

- **TC-4.1c: Codex message sending works as before**
  - Given: An active Codex session
  - When: `sendMessage` is called
  - Then: The ACP `session/prompt` flow executes, and `sendMessage` resolves after deterministic turn-start binding (not terminal completion)

**AC-4.2:** The Codex provider translates ACP notifications to upsert and turn outputs

- **TC-4.2a: ACP agent_message_chunk maps to message upsert emissions**
  - Given: An ACP `session/update` notification with `sessionUpdate: "agent_message_chunk"` containing text
  - When: The Codex provider processes this notification
  - Then: A `message` upsert emission is produced with accumulated content semantics

- **TC-4.2b: ACP tool_call maps to tool_call create emissions**
  - Given: An ACP `session/update` notification with `sessionUpdate: "tool_call"` containing tool name, ID, and status
  - When: The Codex provider processes this notification
  - Then: A `tool_call` create emission is produced with the tool name and call ID

- **TC-4.2c: ACP tool_call_update maps to tool_call completion emissions**
  - Given: An ACP `session/update` notification with `sessionUpdate: "tool_call_update"` containing status `completed` and content
  - When: The Codex provider processes this notification
  - Then: A `tool_call` complete emission is produced with result content and call ID

---

### 5. Upsert Stream Processor

The upsert stream processor converts canonical stream events into progressively-updated renderable objects. It is ported from the cody-fastify implementation with input type adaptation.

#### Acceptance Criteria

**AC-5.1:** The processor converts canonical stream events into upsert objects with full accumulated content

- **TC-5.1a: Simple text message produces create and complete emissions**
  - Given: A sequence of `response_start` → `item_start` (message) → `item_delta` (text chunks) → `item_done` → `response_done`
  - When: Fed through the processor
  - Then: Upsert objects are emitted with `status: "create"` on first emission and `status: "complete"` on final, each carrying the full accumulated text content

- **TC-5.1b: Each emission carries full content, not deltas**
  - Given: Multiple `item_delta` events accumulating 100 tokens of text
  - When: The batch gradient triggers an emission at 30 tokens
  - Then: The emitted upsert object contains all 30 tokens, not just the delta since the last emission

- **TC-5.1c: Tool calls emit on invocation and completion only**
  - Given: A `item_start` (function_call) followed by argument deltas and `item_done`, then later a `item_done` (function_call_output) with result
  - When: Fed through the processor
  - Then: Exactly two emissions occur — one with `status: "create"` (invocation; arguments may be partial/empty at create time) and one with `status: "complete"` (with result and original itemId)

- **TC-5.1d: Thinking blocks are processed as reasoning content**
  - Given: `item_start` (reasoning) followed by deltas and `item_done`
  - When: Fed through the processor
  - Then: Upsert objects are emitted with `type: "thinking"` and accumulated reasoning text

**AC-5.2:** The batch gradient controls emission frequency

Default gradient for deterministic behavior in this epic: `[10, 20, 40, 80, 120]` tokens. Thresholds are strict (`>`), and after the final entry the processor repeats `120` for all later emissions.

- **TC-5.2a: Early emissions are frequent (small batches)**
  - Given: A stream of text deltas arriving one token at a time
  - When: 10 tokens have accumulated (first gradient threshold)
  - Then: An emission occurs after strictly exceeding the threshold

- **TC-5.2b: Later emissions are less frequent (larger batches)**
  - Given: A long response that has progressed past the early gradient thresholds
  - When: Tokens continue accumulating
  - Then: Emissions occur at progressively wider intervals matching the gradient

- **TC-5.2c: Threshold must be strictly exceeded, not equaled**
  - Given: Accumulated tokens exactly equal the current threshold
  - When: No additional tokens arrive
  - Then: No emission occurs until the threshold is strictly exceeded

- **TC-5.2d: A single large delta crossing multiple thresholds emits once**
  - Given: A single delta containing enough tokens to cross 3 gradient thresholds
  - When: Processed
  - Then: One emission occurs, and the batch index advances to match the crossed thresholds

- **TC-5.2e: Gradient exhaustion repeats the last value**
  - Given: A response long enough to exhaust all gradient entries
  - When: Tokens continue accumulating past the last gradient entry
  - Then: The last gradient value is used for all subsequent thresholds

- **TC-5.2f: Default gradient sequence is explicit**
  - Given: Upsert processor configuration is not overridden
  - When: The processor initializes
  - Then: It uses gradient thresholds `[10, 20, 40, 80, 120]` in that order

**AC-5.3:** Tool call correlation works across invocation and result phases

- **TC-5.3a: Result is correlated to invocation by callId**
  - Given: A tool call invocation emitted with a `callId`, followed later by a function_call_output with the same `callId`
  - When: The processor handles the output
  - Then: The completion emission uses the original `itemId` from the invocation, not a new one

- **TC-5.3b: Multiple concurrent tool calls are tracked independently**
  - Given: Two tool calls started before either completes (interleaved)
  - When: Results arrive for each
  - Then: Each result is correctly correlated to its invocation by `callId`

**AC-5.4:** The processor handles edge cases gracefully

- **TC-5.4a: Processor destruction mid-stream flushes buffered content**
  - Given: Content is buffered but not yet emitted (below threshold)
  - When: The processor is destroyed due to a turn error
  - Then: A final emission with `status: "error"` includes all buffered content; error paths must not emit `status: "complete"`

- **TC-5.4b: Batch timeout forces emission after configurable delay**
  - Given: Content is buffered but no new deltas arrive
  - When: The batch timeout period elapses (default 1000ms)
  - Then: An emission occurs with the current buffered content

- **TC-5.4c: Empty content is handled without error**
  - Given: An `item_start` followed immediately by `item_done` with no deltas
  - When: Processed
  - Then: A single emission with empty content and `status: "complete"` occurs

- **TC-5.4d: Cancelled items are discarded silently**
  - Given: An `item_cancelled` event for a buffered item
  - When: Processed
  - Then: No item upsert emission occurs for the cancelled item; buffer is cleaned up

- **TC-5.4e: Turn cancellation is represented at turn lifecycle level**
  - Given: A turn is cancelled after one or more item cancellations
  - When: The processor completes turn handling
  - Then: The turn lifecycle output reports cancelled status; no cancelled item is mislabeled as `complete` or `error`

- **TC-5.4f: Turn errors are represented as `turn_error` events**
  - Given: A turn fails with an unrecoverable provider or processor error
  - When: Turn lifecycle output is emitted
  - Then: A `turn_error` event is emitted with error code and message, and no `turn_complete` event is emitted with an error status

---

### 6. Session API

The session API module provides HTTP routes that coordinate providers and deliver session data to the browser. It replaces the current direct WebSocket-to-ACP wiring with a structured API layer. During migration, Builder keeps externally stable behavior for existing chat flows while introducing the new contract.

Session loading uses an explicit external contract: `POST /api/session/:id/load` maps to provider `loadSession`. Session creation (`POST /api/session/create`) is create-only.

#### Acceptance Criteria

**AC-6.1:** Session API routes handle session lifecycle

- **TC-6.1a: Create session returns session handle**
  - Given: A request to create a session with CLI type and project directory
  - When: `POST /api/session/create` is called
  - Then: The appropriate provider creates a session and the response includes the session ID and CLI type

- **TC-6.1b: Create session with unknown CLI type returns error**
  - Given: A request with a CLI type that has no registered provider
  - When: `POST /api/session/create` is called
  - Then: 400 is returned with a descriptive error code

- **TC-6.1c: List sessions returns active sessions for a project**
  - Given: Multiple sessions have been created across multiple projects
  - When: `GET /api/session/list?projectId=<projectId>` is called
  - Then: Active sessions for that project are returned with their metadata (ID, CLI type, project, status)

- **TC-6.1d: List sessions requires projectId**
  - Given: A request to list sessions with no `projectId` query parameter
  - When: `GET /api/session/list` is called
  - Then: 400 is returned with `PROJECT_ID_REQUIRED`

- **TC-6.1e: Load session routes to provider loadSession**
  - Given: An existing session ID
  - When: `POST /api/session/:id/load` is called
  - Then: The matching provider's `loadSession` is called and the session is returned as loaded/open

- **TC-6.1f: Load session for nonexistent session returns error**
  - Given: A session ID that doesn't exist
  - When: `POST /api/session/:id/load` is called
  - Then: 404 is returned with `SESSION_NOT_FOUND` error code

**AC-6.2:** Session API routes handle messaging

- **TC-6.2a: Send message routes to the correct provider**
  - Given: An active Claude Code session
  - When: `POST /api/session/:id/send` is called with a message
  - Then: The Claude Code provider's `sendMessage` is called, streaming begins, and the response includes `turnId`

- **TC-6.2b: Send message to nonexistent session returns error**
  - Given: A session ID that doesn't exist
  - When: `POST /api/session/:id/send` is called
  - Then: 404 is returned with SESSION_NOT_FOUND error code

- **TC-6.2c: Cancel routes to the correct provider**
  - Given: An active session with a turn in progress
  - When: `POST /api/session/:id/cancel` is called
  - Then: The appropriate provider's `cancelTurn` is called

- **TC-6.2d: Returned turnId is the canonical turn identifier**
  - Given: A successful `POST /api/session/:id/send` response with `{ turnId }`
  - When: Emitted turn events and related upsert emissions for that turn are observed
  - Then: All outputs for that turn use the same `turnId`

**AC-6.3:** Session API coordinates provider process lifecycle

- **TC-6.3a: Session kill terminates the provider process**
  - Given: An active session with a running CLI process
  - When: `POST /api/session/:id/kill` is called
  - Then: The provider's `killSession` is called and the session is removed from the active session list

- **TC-6.3b: Session status reflects provider state**
  - Given: An active session
  - When: `GET /api/session/:id/status` is called
  - Then: The response includes whether the provider process is alive and the session's current state

**AC-6.4:** Message contract migration is complete and legacy paths are removed

**Post-pivot (2026-02-17):** The compatibility window was removed. TC-6.4a (compatibility window) and TC-6.4c (dual-family routing) are eliminated. Legacy removal happens in Story 6, not Story 7.

- **TC-6.4a:** ~~Removed — no compatibility window exists~~
- **TC-6.4b:** Absorbed into Story 6 — legacy message paths are removed when upsert pipeline is wired
- **TC-6.4c:** ~~Removed — only one message family (upsert-v1) exists~~

---

### 7. Pipeline Integration + Browser

The pipeline integration wires provider callback outputs through WebSocket delivery. The browser client is updated to consume upsert objects instead of the current ChatEntry format.

#### Acceptance Criteria

**AC-7.1:** Provider callback outputs are wired to WebSocket delivery (with compatibility processor path where needed)

- **TC-7.1a: Claude Code text streaming reaches the browser as upsert objects**
  - Given: A Claude Code session with an active turn
  - When: The SDK streams text content
  - Then: Upsert objects with `type: "message"` arrive at the browser via WebSocket with progressively accumulated content

- **TC-7.1b: Codex text streaming reaches the browser as upsert objects**
  - Given: A Codex session with an active turn
  - When: The ACP adapter streams agent_message_chunk notifications
  - Then: Upsert objects with `type: "message"` arrive at the browser via WebSocket

- **TC-7.1c: Tool calls from both providers reach the browser as upsert objects**
  - Given: Either a Claude Code or Codex session
  - When: The agent executes a tool call
  - Then: Upsert objects with `type: "tool_call"` arrive at the browser — one with `status: "create"` (invocation) and one with `status: "complete"` (result)

**AC-7.2:** The browser renders from upsert objects

- **TC-7.2a: Text messages render progressively**
  - Given: Upsert objects arriving for a text message with increasing content
  - When: The browser processes each object
  - Then: The rendered message updates in place with the latest accumulated text

- **TC-7.2b: Tool calls render with invocation and completion states**
  - Given: A tool call upsert object with `status: "create"`, followed later by one with `status: "complete"`
  - When: The browser processes both
  - Then: The tool call renders initially showing the invocation, then updates to show the result

- **TC-7.2c: Multiple items render independently**
  - Given: Upsert objects for different itemIds arriving interleaved
  - When: The browser processes them
  - Then: Each item renders independently — updating one does not affect others

**AC-7.3:** Session loading works through the new pipeline

- **TC-7.3a: Loading an existing Claude Code session displays history**
  - Given: An existing Claude Code session with conversation history
  - When: `POST /api/session/:id/load` is called (for example, when opened in a tab)
  - Then: The conversation history renders in the browser

- **TC-7.3b: Loading an existing Codex session displays history**
  - Given: An existing Codex session with conversation history
  - When: `POST /api/session/:id/load` is called
  - Then: The conversation history renders in the browser

**AC-7.4:** The old ACP-direct path is removed

- **TC-7.4a: No direct ACP-to-WebSocket code remains**
  - Given: The codebase after pipeline integration
  - When: Inspected
  - Then: All active streaming flows go through provider/session-service contracts into websocket delivery. Legacy bridge paths are removed, including `createPromptBridgeMessages` and related ACP-centric direct-stream wiring.

---

### 8. End-to-End Verification

The system behaves identically to before from the user's perspective. This contract verifies that the refactoring preserved all existing functionality.

#### Acceptance Criteria

**AC-8.1:** Claude Code end-to-end flow works

- **TC-8.1a: Create session, send message, receive streaming response**
  - Given: A Claude Code provider configured
  - When: A new session is created, a message is sent, and the agent responds
  - Then: The response streams to the browser progressively and renders correctly

- **TC-8.1b: Tool calls display correctly**
  - Given: A Claude Code session where the agent executes tools
  - When: The turn completes
  - Then: Tool calls display with name, arguments, and results

- **TC-8.1c: Cancel interrupts a running turn**
  - Given: A Claude Code session with a turn in progress
  - When: Cancel is triggered
  - Then: The turn stops and the session is ready for a new message

**AC-8.2:** Codex end-to-end flow works

- **TC-8.2a: Create session, send message, receive streaming response**
  - Given: A Codex provider configured
  - When: A new session is created, a message is sent, and the agent responds
  - Then: The response streams to the browser and renders correctly

- **TC-8.2b: Tool calls display correctly**
  - Given: A Codex session where the agent executes tools
  - When: The turn completes
  - Then: Tool calls display with name, arguments, and results

**AC-8.3:** Tab switching and session loading work

- **TC-8.3a: Switching between Claude Code and Codex tabs preserves state**
  - Given: One Claude Code tab and one Codex tab open with conversation history
  - When: The user switches between tabs
  - Then: Each tab displays its correct conversation history

- **TC-8.3b: Opening an existing session loads its history**
  - Given: A session with prior conversation history (from before the refactor)
  - When: The session is opened in a new tab
  - Then: The full conversation history loads and displays correctly

---

## Data Contracts

### Canonical Stream Event Schema

The canonical stream event format is a Zod-validated discriminated union. All events share an envelope; the payload varies by type.

```typescript
interface StreamEventEnvelope {
  /** Unique event identifier */
  eventId: string;

  /** When this event was generated */
  timestamp: string; // ISO 8601 UTC

  /** Turn this event belongs to */
  turnId: string;

  /** Session this event belongs to */
  sessionId: string;

  /** Event type discriminator */
  type: StreamEventType;

  /** Type-specific payload */
  payload: StreamEventPayload;
}

type StreamEventType =
  | 'response_start'
  | 'item_start'
  | 'item_delta'
  | 'item_done'
  | 'item_error'
  | 'item_cancelled'
  | 'response_done'
  | 'response_error';
```

### Stream Event Payloads

```typescript
interface ResponseStartPayload {
  type: 'response_start';
  modelId: string;
  providerId: string;
}

interface ItemStartPayload {
  type: 'item_start';
  itemId: string;
  itemType: 'message' | 'reasoning' | 'function_call' | 'function_call_output';
  /** Initial content, if available at start */
  initialContent?: string;
  /** Tool name (function_call only) */
  name?: string;
  /** Tool call correlation ID (function_call only) */
  callId?: string;
}

interface ItemDeltaPayload {
  type: 'item_delta';
  itemId: string;
  /** Incremental content fragment */
  deltaContent: string;
}

interface ItemDonePayload {
  type: 'item_done';
  itemId: string;
  /** The complete, finalized item */
  finalItem: FinalizedItem;
}

interface ItemErrorPayload {
  type: 'item_error';
  itemId: string;
  error: { code: string; message: string };
}

interface ItemCancelledPayload {
  type: 'item_cancelled';
  itemId: string;
  reason?: string;
}

interface ResponseDonePayload {
  type: 'response_done';
  status: 'completed' | 'cancelled' | 'error';
  finishReason?: string;
  /** When status is error, providers should include structured terminal error details */
  error?: { code: string; message: string };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
}

interface ResponseErrorPayload {
  type: 'response_error';
  error: { code: string; message: string };
}
```

Turn lifecycle mapping note: when provider/stream response data indicates an error terminal state, the processor emits `turn_error` (not `turn_complete` with error status). Precedence for error details is `response_error.error` first, then `response_done.error`, then compatibility fallback derived from `finishReason` when structured error fields are unavailable.

### Finalized Item

```typescript
type FinalizedItem =
  | { type: 'message'; content: string; origin: 'user' | 'agent' | 'system' }
  | { type: 'reasoning'; content: string; providerId: string }
  | { type: 'function_call'; name: string; callId: string; arguments: Record<string, unknown> }
  | { type: 'function_call_output'; callId: string; output: string; isError: boolean };
```

### Upsert Object (Processor Output)

```typescript
interface UpsertObjectBase {
  turnId: string;
  sessionId: string;
  itemId: string;
  /** Provider/source event time used for downstream canonical sourceTimestamp derivation */
  sourceTimestamp: string; // ISO 8601 UTC
  /** Time the processor emitted this upsert object */
  emittedAt: string; // ISO 8601 UTC
  status: 'create' | 'update' | 'complete' | 'error';
  errorCode?: string;
  errorMessage?: string;
}

interface MessageUpsert extends UpsertObjectBase {
  type: 'message';
  content: string;
  origin: 'user' | 'agent' | 'system';
}

interface ThinkingUpsert extends UpsertObjectBase {
  type: 'thinking';
  content: string;
  providerId: string;
}

interface ToolCallUpsert extends UpsertObjectBase {
  type: 'tool_call';
  toolName: string;
  /** May be partial/empty on create; finalized arguments are authoritative by function_call item_done */
  toolArguments: Record<string, unknown>;
  callId: string;
  toolOutput?: string;
  toolOutputIsError?: boolean;
}

type UpsertObject = MessageUpsert | ThinkingUpsert | ToolCallUpsert;
```

### Upsert Processor Configuration

```typescript
interface UpsertProcessorConfig {
  /** Emission thresholds in tokens; defaults are deterministic for testability */
  batchGradientTokens: readonly number[]; // default: [10, 20, 40, 80, 120]
  /** Flush buffered content when idle */
  batchTimeoutMs: number; // default: 1000
}
```

### Turn Lifecycle Events (Processor Output)

```typescript
type TurnEvent =
  | { type: 'turn_started'; turnId: string; sessionId: string; modelId: string; providerId: string }
  | { type: 'turn_complete'; turnId: string; sessionId: string; status: 'completed' | 'cancelled'; usage?: object }
  | { type: 'turn_error'; turnId: string; sessionId: string; errorCode: string; errorMessage: string };
```

Error terminal rule: use `turn_error` for failed turns; use `turn_complete` only for successful completion or cancellation.

### Provider Interface

```typescript
interface CliProvider {
  readonly cliType: string;

  createSession(options: CreateSessionOptions): Promise<ProviderSession>;
  loadSession(sessionId: string, options?: LoadSessionOptions): Promise<ProviderSession>;
  sendMessage(sessionId: string, message: string): Promise<SendMessageResult>;
  cancelTurn(sessionId: string): Promise<void>;
  killSession(sessionId: string): Promise<void>;
  isAlive(sessionId: string): boolean;

  /** Register callback for upsert object emissions */
  onUpsert(sessionId: string, callback: (upsert: UpsertObject) => void): void;
  /** Register callback for turn lifecycle emissions */
  onTurn(sessionId: string, callback: (event: TurnEvent) => void): void;
}

interface CreateSessionOptions {
  projectDir: string;
  /** Additional provider-specific options */
  providerOptions?: Record<string, unknown>;
}

interface LoadSessionOptions {
  viewFilePath?: string;
}

interface ProviderSession {
  sessionId: string;
  cliType: string;
}

interface SendMessageResult {
  /** Canonical turn identifier for this request; stream events for the turn must reuse this value */
  turnId: string;
}
```

### Session API Routes

| Method | Path | Description | Success | Error |
|--------|------|-------------|---------|-------|
| POST | `/api/session/create` | Create new session | 201 `{ sessionId, cliType }` | 400 `UNSUPPORTED_CLI_TYPE` |
| POST | `/api/session/:id/load` | Load/open existing session history | 200 `{ sessionId, cliType }` | 404 `SESSION_NOT_FOUND` |
| GET | `/api/session/list?projectId=<projectId>` | List active sessions for a project | 200 `{ sessions: [...] }` | 400 `PROJECT_ID_REQUIRED` |
| GET | `/api/session/:id/status` | Get session status | 200 `{ sessionId, cliType, isAlive, state }` | 404 `SESSION_NOT_FOUND` |
| POST | `/api/session/:id/send` | Send message | 202 `{ turnId }` | 404 `SESSION_NOT_FOUND` |
| POST | `/api/session/:id/cancel` | Cancel current turn | 200 | 404 `SESSION_NOT_FOUND` |
| POST | `/api/session/:id/kill` | Terminate session | 200 | 404 `SESSION_NOT_FOUND` |

`turnId` ownership contract: the value returned by `POST /api/session/:id/send` comes from provider `sendMessage()` and is the canonical turn identifier for all events emitted for that turn.

### WebSocket Messages (Builder → Browser)

```typescript
/** Streaming upsert object delivery */
interface WsUpsertMessage {
  type: 'session:upsert';
  sessionId: string;
  payload: UpsertObject;
}

/** Turn lifecycle event */
interface WsTurnMessage {
  type: 'session:turn';
  sessionId: string;
  payload: TurnEvent;
}

/** Session history (on load) */
interface WsHistoryMessage {
  type: 'session:history';
  sessionId: string;
  entries: UpsertObject[];
}
```

**Post-pivot (2026-02-17):** The compatibility window was removed. The server emits only `session:upsert`, `session:turn`, and `session:history` messages. Legacy chat messages (`session:update`, `session:chunk`, `session:complete`, `session:cancelled`) are removed in Story 6, not deferred to Story 7. No `session:hello` negotiation or per-connection family routing exists. See `stories/story-6-pipeline-browser-migration/story-6-pivot-addendum.md` for rationale.

---

## Dependencies

Technical dependencies:
- `@anthropic-ai/claude-agent-sdk` (direct dependency in Builder, not just transitive via claude-code-acp)
- Existing ACP adapter binary `codex-acp` remains for the Codex provider in this epic
- Zod for schema validation
- Vitest for testing

Process dependencies:
- Canonical stream event format (Story 0) must stabilize before providers are built
- Claude Code SDK provider (Story 4 in current story sharding) is the critical path — if the streaming input model doesn't work as documented, the approach needs revision

---

## Non-Functional Requirements

### Performance
- Claude Code session load path uses a single SDK `query()` session loop (no ACP double-init path); benchmark before/after on the same machine and report median + P95 startup-to-first-token timing
- Codex session load time should remain within +/-10% of the current ACP baseline on the same machine
- Streaming latency from provider event to browser render should remain within +/-10% of the current direct path baseline
- Upsert processor batch gradient should produce first visible tokens within 200ms of CLI response start

### Reliability
- Provider subprocess crash should be detectable and reported (not silent hang)
- Provider process orphans should not accumulate (kill cleans up)
- The processor's error-path flush-on-destroy guarantees no buffered content is silently lost, and no cancelled/error item is mislabeled as `complete`

### Testability
- All provider event translation behavior is testable with mock CLI events (no real subprocess needed)
- The upsert processor is testable with fixture-driven inputs (20 scenarios from cody-fastify)
- Session API routes are testable via Fastify inject (no real providers needed)

---

## Tech Design Questions

Questions for the Tech Lead to address during design:

1. **SDK dependency installation:** How should `@anthropic-ai/claude-agent-sdk` be installed as a direct dependency? Does Builder need to also install `@anthropic-ai/sdk` for type definitions (`RawMessageStreamEvent`)?

2. **Streaming input generator lifecycle:** What happens when the `AsyncIterable<SDKUserMessage>` generator encounters an error? What happens when the subprocess dies mid-turn? How does the provider detect and report this to the session module?

3. **Content block index tracking:** The SDK uses integer indices for content blocks within a message. The provider needs to map these to stable `itemId`s. What ID generation strategy? UUIDs? `{turnId}-{blockIndex}`?

4. **Session history on load:** When a session is loaded via provider `loadSession` (which may use provider-specific resume mechanics), history can replay notifications. Should the provider process these through the normal event path (generating upsert objects for history), or should history loading be a separate code path that populates the browser differently?

5. **WebSocket compatibility window details:** ~~Post-pivot (2026-02-17): The compatibility window was removed. Story 6 delivers upsert-v1 directly with no legacy coexistence. This question is resolved.~~

6. **ACP code retention:** After refactoring, should the old `acp-client.ts` and `acp-types.ts` files be deleted entirely, or kept temporarily as reference? The Codex provider wraps ACP, so some ACP code must remain — the question is how much of the current 810-line file survives vs. gets extracted.

7. **Error propagation model:** When a provider encounters an error (subprocess crash, SDK error, ACP timeout), what error type is surfaced through the provider interface? Should there be a `ProviderError` class hierarchy, or flat error codes?

8. **Test strategy for SDK integration:** The SDK spawns real subprocesses. Integration tests need either mock SDK responses or a real Claude Code installation. What's the mock boundary — mock the SDK's `query()` function, or mock at a higher level?

9. **Browser rendering compatibility:** The current browser uses ChatEntry objects with specific fields (`role`, `content`, `toolCalls`, `status`). Upsert objects have a different shape. How much browser-side code needs to change? Should there be a thin adapter in the browser, or a clean break?

10. **Thinking/extended thinking tradeoff:** With `maxThinkingTokens` set, the SDK doesn't stream thinking events — only complete messages. Without it, thinking streams but has no budget control. Which mode does the provider use? Is this configurable per session?

11. **Session metadata persistence:** The session module needs to track active sessions across Builder restarts. What persistence mechanism? The current `~/.liminal-builder/` JSON files? Or is this deferred until Context integration?

---

## Recommended Story Breakdown

### Story 0: Infrastructure + Canonical Format
Types, Zod schemas (stream events, upsert objects, turn events, provider interface), shared test utilities, test fixture helpers. No runtime code — pure type definitions and validation schemas.
**ACs covered:**
- AC-1.1 (schema coverage across provider event types)
- AC-1.2 (correlation IDs)
- AC-1.3 (Phase 1 contract compatibility boundary for Phase 2 ingestion)

### Story 1: Contracts + Interface Tests
**Delivers:** Contract-level tests for schemas/interfaces, including provider-interface placeholders that activate in provider stories.
**Prerequisite:** Story 0
**ACs covered:**
- AC-1.1, AC-1.2, AC-1.3 (executable contract coverage)
- AC-2.1a (provider interface method surface)
- TC-2.1b/TC-2.1c placeholders (activated in Stories 4/5)

### Story 2: Upsert Stream Processor
**Delivers:** The streaming processor converts canonical events to upsert objects with batching, gradient, and tool call correlation.
**Prerequisite:** Story 0
**ACs covered:**
- AC-5.1 (canonical events to upsert objects)
- AC-5.2 (batch gradient)
- AC-5.3 (tool call correlation)
- AC-5.4 (edge cases)

### Story 3: Session API + Provider Registry
**Delivers:** HTTP routes for session lifecycle and provider lookup by CLI type.
**Prerequisite:** Story 0
**ACs covered:**
- AC-2.2 (provider registry)
- AC-6.1 (session lifecycle routes)
- AC-6.2 (messaging routes)
- AC-6.3 (process lifecycle routes)

### Story 4: Claude Code SDK Provider
**Delivers:** Claude Code sessions use the SDK directly with persistent subprocess and streaming input, emitting upsert/turn outputs via provider callbacks.
**Prerequisite:** Stories 0, 2, 3
**ACs covered:**
- AC-2.1 (provider satisfies interface — Claude Code)
- AC-3.1 (session creation/loading via SDK)
- AC-3.2 (message delivery via streaming input)
- AC-3.3 (SDK event translation to upsert/turn)
- AC-3.4 (lifecycle operations)

### Story 5: Codex ACP Provider Refactor
**Delivers:** Existing ACP code extracted behind the provider interface. Codex behavior preserved while emitting upsert/turn outputs via provider callbacks.
**Prerequisite:** Stories 0, 2, 3, 4
**ACs covered:**
- AC-2.1 (provider satisfies interface — Codex)
- AC-4.1 (ACP extraction without behavior change)
- AC-4.2 (ACP notification translation to upsert/turn)

### Story 6: Pipeline Integration + Browser (Post-Pivot: No Compatibility Window)
**Delivers:** Provider callback outputs wired directly to WebSocket delivery via upsert-v1. Legacy message paths removed. Browser consumes upsert objects.
**Prerequisite:** Stories 2, 4, 5
**ACs covered:**
- AC-6.4 (legacy paths removed — no compatibility window, direct upsert-v1 only)
- AC-7.1 (pipeline wiring)
- AC-7.2 (browser rendering from upserts)
- AC-7.3 (session loading)
- AC-7.4 (old path removed)

### Story 7: End-to-End Verification + Cleanup + NFR
**Delivers:** Full system verified end-to-end. Dead code removed (processor, envelope schema). Both CLIs working. NFR gates passed.
**Prerequisite:** Story 6
**ACs covered:**
- AC-8.1 (Claude Code end-to-end)
- AC-8.2 (Codex end-to-end)
- AC-8.3 (tab switching and session loading)

### Story Dependency Graph

```
Story 0 (Infrastructure + Canonical Format)
    ├──→ Story 1 (Contracts + Interface Tests)
    ├──→ Story 2 (Upsert Stream Processor)
    └──→ Story 3 (Session API + Provider Registry)
              ↓
         Story 4 (Claude Code SDK Provider)                 ← critical path
              ↓
         Story 5 (Codex ACP Provider Refactor)
              ↓
         Story 6 (Pipeline Integration + Browser; depends on Stories 2, 4, 5)
              ↓
         Story 7 (Verification + Cleanup)
```

**Parallelism:** Stories 1, 2, and 3 can execute in parallel after Story 0 where dependencies allow. Story 5 depends on Story 4 for pivot-contract continuity, so they execute sequentially. Stories 6-7 are sequential.

---

## Technical Notes & Considerations

### Terminology Boundary: Stream Mechanism vs Domain Model

`UpsertObject` (or `UpsertStreamObject` if renamed in implementation) refers to a technical stream/render transport mechanism. It is not a domain entity.

Use mechanism terminology where the mechanism matters:
- Provider event translation
- Stream processor behavior (batching, correlation, replacement semantics)
- WebSocket payload contracts for progressive rendering

Use domain terminology where behavior and outcomes matter:
- Session lifecycle, turn lifecycle, history retrieval, and user-visible chat behavior
- Cross-domain persistence contracts with Context (`CanonicalEntry`)

If a requirement remains clear without naming the stream mechanism, prefer domain abstractions (`session`, `turn`, `entry`, `history`) over mechanism terms.

---

## Validation Checklist

- [ ] System Profile has all four fields + Architecture Overview
- [ ] Contracts cover all integration points (provider, processor, session API, browser)
- [ ] Every AC is testable (no vague terms)
- [ ] Every AC has at least one TC
- [ ] TCs cover happy path, edge cases, and errors
- [ ] Data contracts are fully typed
- [ ] Scope boundaries are explicit (in/out/assumptions)
- [ ] Story breakdown covers all ACs
- [ ] Stories sequence logically
- [ ] All validator issues addressed
- [ ] Self-review complete
