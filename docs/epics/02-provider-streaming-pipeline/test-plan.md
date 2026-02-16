# Test Plan: Provider Architecture and Streaming Pipeline

## Purpose

This document provides complete test architecture and TC-to-test traceability for:

- Epic: `/Users/leemoore/liminal/apps/liminal-builder/docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- Technical design: `/Users/leemoore/liminal/apps/liminal-builder/docs/epics/02-provider-streaming-pipeline/tech-design.md`

This plan is the executable confidence chain for the epic:

`AC -> TC -> Test file -> Test case -> Implementation`

## Test Strategy

### Primary Layer: Service-Mock Tests

Run fast, deterministic tests at module entry points while mocking only external boundaries.

- Provider tests mock SDK/ACP boundaries.
- Session API tests exercise route-to-service wiring with mocked providers.
- Processor tests run real processor logic with fixture events.
- Browser rendering tests run real render logic with jsdom and mocked transport payloads.

### Secondary Layer: Integration and Manual

- Integration tests cover end-to-end provider streaming flows.
- Manual gorilla tests validate behavior that depends on local toolchains and runtime UX timing.

## Mock Boundaries

| Boundary | Mocked | Why |
|---|---|---|
| Claude Agent SDK query stream | Yes | External runtime process and network behavior |
| ACP adapter process and notifications | Yes | External process and protocol boundary |
| Filesystem and process spawn APIs | Yes | Determinism and CI stability |
| Session service internals (from routes) | No | Route-service integration is under test |
| Processor internals | No | Processor behavior is the test target |
| Portlet renderer internals | No | DOM behavior is under test |

## Test Suites and Ownership

| Test File | Suite Type | Primary Coverage |
|---|---|---|
| `tests/server/contracts/stream-contracts.test.ts` | service mock | AC-1.x contract validation |
| `tests/server/providers/provider-interface.test.ts` | service mock | AC-2.1 typing and lifecycle interface |
| `tests/server/providers/provider-registry.test.ts` | service mock | AC-2.2 registry behavior |
| `tests/server/providers/claude-sdk-provider.test.ts` | service mock | AC-3.x Claude provider behavior |
| `tests/server/providers/codex-acp-provider.test.ts` | service mock | AC-4.x Codex provider behavior |
| `tests/server/streaming/upsert-stream-processor.test.ts` | service mock | AC-5.x processor behavior |
| `tests/server/api/session-routes.test.ts` | service mock | AC-6.1, AC-6.2, AC-6.3 |
| `tests/server/websocket/websocket-compatibility.test.ts` | service mock | AC-6.4 + AC-7.4 |
| `tests/server/pipeline/pipeline-integration.test.ts` | service mock | AC-7.1 delivery wiring |
| `tests/client/upsert/portlet-upsert-rendering.test.ts` | service mock (ui) | AC-7.2 rendering semantics |
| `tests/server/pipeline/session-history-pipeline.test.ts` | service mock | AC-7.3 history replay |
| `tests/integration/provider-streaming-e2e.test.ts` | integration | AC-8.x end-to-end |

## Verification Commands

Use project scripts as gates:

- `bun run red-verify`
- `bun run verify`
- `bun run green-verify`
- `bun run verify-all`

`verify-all` currently includes placeholder `test:e2e`; E2E coverage in this plan is implemented as integration-level tests unless a full browser E2E suite is introduced later.

## Protocol Negotiation Contract Tests

Compatibility-family negotiation is a formal contract in this design, not an implementation detail.

| Contract | Test File | Assertion |
|---|---|---|
| `session:hello { streamProtocol: \"upsert-v1\" }` request | `tests/server/websocket/websocket-compatibility.test.ts` | server records selected family for connection |
| `session:hello:ack { selectedFamily }` response | `tests/server/websocket/websocket-compatibility.test.ts` | client receives deterministic selected family |
| one-family-per-connection rule | `tests/server/websocket/websocket-compatibility.test.ts` | connection never receives both legacy and upsert families |

## NFR Verification Coverage

| NFR Target | Test Coverage | Status |
|---|---|---|
| Claude startup median/P95 benchmarked | `tests/integration/perf-claude-startup.test.ts` | Planned |
| Codex load within +/-10% baseline | `tests/integration/perf-codex-load.test.ts` | Planned |
| Provider-to-render latency within +/-10% baseline | `tests/integration/perf-stream-latency.test.ts` | Planned |
| First visible token <=200ms | `tests/integration/perf-stream-latency.test.ts` | Planned |
| Crash detection and orphan cleanup | `tests/integration/provider-lifecycle-reliability.test.ts` | Planned |

NFR coverage contributes 5 required non-TC verification checks and is included in Chunk 6 test-count estimates.

## Complete TC to Test Mapping

| TC | Test File | Test Description | Status |
|---|---|---|---|
| TC-1.1a | `tests/server/contracts/stream-contracts.test.ts` | validates text `item_delta` payload and envelope | Planned |
| TC-1.1b | `tests/server/contracts/stream-contracts.test.ts` | validates tool-call lifecycle payloads across start/delta/done | Planned |
| TC-1.1c | `tests/server/contracts/stream-contracts.test.ts` | validates reasoning item payloads | Planned |
| TC-1.1d | `tests/server/contracts/stream-contracts.test.ts` | validates response lifecycle payloads with usage and finishReason | Planned |
| TC-1.1e | `tests/server/contracts/stream-contracts.test.ts` | validates item and response error payloads | Planned |
| TC-1.1f | `tests/server/contracts/stream-contracts.test.ts` | rejects malformed event payloads with schema errors | Planned |
| TC-1.2a | `tests/server/contracts/stream-contracts.test.ts` | enforces per-turn correlation by shared turnId | Planned |
| TC-1.2b | `tests/server/contracts/stream-contracts.test.ts` | enforces per-item correlation by shared itemId | Planned |
| TC-1.2c | `tests/server/contracts/stream-contracts.test.ts` | enforces tool correlation by shared callId | Planned |
| TC-1.3a | `tests/server/contracts/stream-contracts.test.ts` | verifies provenance fields needed for downstream ingestion | Planned |
| TC-1.3b | `tests/server/contracts/stream-contracts.test.ts` | verifies documented Phase 2 derivation boundary is explicit | Planned |
| TC-2.1a | `tests/server/providers/provider-interface.test.ts` | asserts interface includes create/load/send/cancel/kill/isAlive/onEvent | Planned |
| TC-2.1b | `tests/server/providers/provider-interface.test.ts` | compile-time conformance check for Claude provider | Planned |
| TC-2.1c | `tests/server/providers/provider-interface.test.ts` | compile-time conformance check for Codex provider | Planned |
| TC-2.2a | `tests/server/providers/provider-registry.test.ts` | resolves provider by `claude-code` key | Planned |
| TC-2.2b | `tests/server/providers/provider-registry.test.ts` | returns unsupported-cli error for unknown key | Planned |
| TC-3.1a | `tests/server/providers/claude-sdk-provider.test.ts` | createSession starts persistent SDK query session | Planned |
| TC-3.1b | `tests/server/providers/claude-sdk-provider.test.ts` | loadSession restores prior session using provider resume mechanics | Planned |
| TC-3.1c | `tests/server/providers/claude-sdk-provider.test.ts` | create failure returns descriptive error and no orphan process | Planned |
| TC-3.2a | `tests/server/providers/claude-sdk-provider.test.ts` | sendMessage delivers user message into AsyncIterable input | Planned |
| TC-3.2b | `tests/server/providers/claude-sdk-provider.test.ts` | sequential sends preserve ordering on same subprocess | Planned |
| TC-3.3a | `tests/server/providers/claude-sdk-provider.test.ts` | maps text content blocks to message start/delta/done events | Planned |
| TC-3.3b | `tests/server/providers/claude-sdk-provider.test.ts` | maps tool_use blocks to function_call canonical events | Planned |
| TC-3.3c | `tests/server/providers/claude-sdk-provider.test.ts` | maps SDK user tool-result messages to function_call_output done event | Planned |
| TC-3.3d | `tests/server/providers/claude-sdk-provider.test.ts` | maps thinking blocks to reasoning canonical events | Planned |
| TC-3.3e | `tests/server/providers/claude-sdk-provider.test.ts` | tracks interleaved blocks independently with unique itemIds | Planned |
| TC-3.3f | `tests/server/providers/claude-sdk-provider.test.ts` | emits response_start and response_done with terminal metadata | Planned |
| TC-3.4a | `tests/server/providers/claude-sdk-provider.test.ts` | cancelTurn calls SDK interrupt and ends turn as cancelled | Planned |
| TC-3.4b | `tests/server/providers/claude-sdk-provider.test.ts` | killSession terminates subprocess and marks dead | Planned |
| TC-3.4c | `tests/server/providers/claude-sdk-provider.test.ts` | isAlive reflects before/after process kill state | Planned |
| TC-4.1a | `tests/server/providers/codex-acp-provider.test.ts` | createSession executes ACP session/new path unchanged | Planned |
| TC-4.1b | `tests/server/providers/codex-acp-provider.test.ts` | loadSession executes ACP session/load replay path unchanged | Planned |
| TC-4.1c | `tests/server/providers/codex-acp-provider.test.ts` | sendMessage executes ACP session/prompt path unchanged | Planned |
| TC-4.2a | `tests/server/providers/codex-acp-provider.test.ts` | maps `agent_message_chunk` to canonical message delta | Planned |
| TC-4.2b | `tests/server/providers/codex-acp-provider.test.ts` | maps `tool_call` to canonical function_call start | Planned |
| TC-4.2c | `tests/server/providers/codex-acp-provider.test.ts` | maps `tool_call_update` completion to canonical function_call completion | Planned |
| TC-5.1a | `tests/server/streaming/upsert-stream-processor.test.ts` | emits create then complete for simple text stream with accumulated content | Planned |
| TC-5.1b | `tests/server/streaming/upsert-stream-processor.test.ts` | each emission contains full accumulated text not incremental delta | Planned |
| TC-5.1c | `tests/server/streaming/upsert-stream-processor.test.ts` | emits exactly invocation create and completion complete for tool call lifecycle | Planned |
| TC-5.1d | `tests/server/streaming/upsert-stream-processor.test.ts` | processes reasoning blocks into thinking upserts | Planned |
| TC-5.2a | `tests/server/streaming/upsert-stream-processor.test.ts` | emits frequently at early small thresholds | Planned |
| TC-5.2b | `tests/server/streaming/upsert-stream-processor.test.ts` | emits less frequently at later larger thresholds | Planned |
| TC-5.2c | `tests/server/streaming/upsert-stream-processor.test.ts` | enforces strict greater-than threshold rule | Planned |
| TC-5.2d | `tests/server/streaming/upsert-stream-processor.test.ts` | single large delta crossing multiple thresholds emits once and advances index | Planned |
| TC-5.2e | `tests/server/streaming/upsert-stream-processor.test.ts` | repeats final gradient value after sequence exhaustion | Planned |
| TC-5.2f | `tests/server/streaming/upsert-stream-processor.test.ts` | default gradient initializes as `[10, 20, 40, 80, 120]` | Planned |
| TC-5.3a | `tests/server/streaming/upsert-stream-processor.test.ts` | correlates function_call_output back to original invocation itemId by callId | Planned |
| TC-5.3b | `tests/server/streaming/upsert-stream-processor.test.ts` | handles concurrent interleaved tool calls with independent correlation | Planned |
| TC-5.4a | `tests/server/streaming/upsert-stream-processor.test.ts` | destroy mid-stream flushes buffered content with error status | Planned |
| TC-5.4b | `tests/server/streaming/upsert-stream-processor.test.ts` | batch timeout flushes buffered content after configured delay | Planned |
| TC-5.4c | `tests/server/streaming/upsert-stream-processor.test.ts` | handles empty item start/done as complete empty-content emission | Planned |
| TC-5.4d | `tests/server/streaming/upsert-stream-processor.test.ts` | discards cancelled items without item upsert emissions | Planned |
| TC-5.4e | `tests/server/streaming/upsert-stream-processor.test.ts` | represents cancellation at turn lifecycle without mislabeling items | Planned |
| TC-5.4f | `tests/server/streaming/upsert-stream-processor.test.ts` | emits `turn_error` and never `turn_complete(error)` on failure terminal state | Planned |
| TC-6.1a | `tests/server/api/session-routes.test.ts` | POST create returns session handle with cli type | Planned |
| TC-6.1b | `tests/server/api/session-routes.test.ts` | POST create unknown cli returns 400 with unsupported code | Planned |
| TC-6.1c | `tests/server/api/session-routes.test.ts` | GET list returns active sessions scoped by project | Planned |
| TC-6.1d | `tests/server/api/session-routes.test.ts` | GET list without projectId returns PROJECT_ID_REQUIRED | Planned |
| TC-6.1e | `tests/server/api/session-routes.test.ts` | POST load routes to provider loadSession | Planned |
| TC-6.1f | `tests/server/api/session-routes.test.ts` | POST load unknown session returns SESSION_NOT_FOUND | Planned |
| TC-6.2a | `tests/server/api/session-routes.test.ts` | POST send routes to matching provider and returns turnId | Planned |
| TC-6.2b | `tests/server/api/session-routes.test.ts` | POST send unknown session returns 404 | Planned |
| TC-6.2c | `tests/server/api/session-routes.test.ts` | POST cancel routes to provider cancelTurn | Planned |
| TC-6.2d | `tests/server/api/session-routes.test.ts` | returned turnId matches all emitted turn events for request | Planned |
| TC-6.3a | `tests/server/api/session-routes.test.ts` | POST kill terminates provider session and removes active entry | Planned |
| TC-6.3b | `tests/server/api/session-routes.test.ts` | GET status returns provider liveness and session state | Planned |
| TC-6.4a | `tests/server/websocket/websocket-compatibility.test.ts` | Story 5 connection can use compatibility window without breaking active chat | Planned |
| TC-6.4b | `tests/server/websocket/websocket-compatibility.test.ts` | Story 6 removes legacy message family emissions | Planned |
| TC-6.4c | `tests/server/websocket/websocket-compatibility.test.ts` | single connection receives only one negotiated message family | Planned |
| TC-7.1a | `tests/server/pipeline/pipeline-integration.test.ts` | Claude text stream reaches browser as message upserts | Planned |
| TC-7.1b | `tests/server/pipeline/pipeline-integration.test.ts` | Codex text stream reaches browser as message upserts | Planned |
| TC-7.1c | `tests/server/pipeline/pipeline-integration.test.ts` | tool calls from both providers deliver create and complete tool_call upserts | Planned |
| TC-7.2a | `tests/client/upsert/portlet-upsert-rendering.test.ts` | progressively updates text message in place by itemId | Planned |
| TC-7.2b | `tests/client/upsert/portlet-upsert-rendering.test.ts` | renders tool call invocation then completion state transition | Planned |
| TC-7.2c | `tests/client/upsert/portlet-upsert-rendering.test.ts` | interleaved items render independently without cross-item mutation | Planned |
| TC-7.3a | `tests/server/pipeline/session-history-pipeline.test.ts` | loading existing Claude session produces browser history rendering | Planned |
| TC-7.3b | `tests/server/pipeline/session-history-pipeline.test.ts` | loading existing Codex session produces browser history rendering | Planned |
| TC-7.4a | `tests/server/websocket/websocket-compatibility.test.ts` | confirms no direct ACP-to-WebSocket legacy bridge path remains | Planned |
| TC-8.1a | `tests/integration/provider-streaming-e2e.test.ts` | Claude create-send-stream flow works end to end | Planned |
| TC-8.1b | `tests/integration/provider-streaming-e2e.test.ts` | Claude tool calls display with name, args, and result | Planned |
| TC-8.1c | `tests/integration/provider-streaming-e2e.test.ts` | Claude cancel interrupts turn and session remains usable | Planned |
| TC-8.2a | `tests/integration/provider-streaming-e2e.test.ts` | Codex create-send-stream flow works end to end | Planned |
| TC-8.2b | `tests/integration/provider-streaming-e2e.test.ts` | Codex tool calls display with name, args, and result | Planned |
| TC-8.3a | `tests/integration/provider-streaming-e2e.test.ts` | switching between Claude and Codex tabs preserves correct state | Planned |
| TC-8.3b | `tests/integration/provider-streaming-e2e.test.ts` | opening existing pre-refactor session loads full history correctly | Planned |

## Coverage Summary

- Total TCs in epic: 85
- Total mapped TCs in this plan: 85
- Unmapped TCs: 0
- Additional non-TC verification tests: 7 (legacy-removal guard + negotiation-ack contract + 5 NFR checks)

## Story-Level Test Counts

| Chunk | Estimated Tests |
|---|---|
| Chunk 0 | 14 |
| Chunk 1 | 18 |
| Chunk 2 | 14 |
| Chunk 3 | 14 |
| Chunk 4 | 8 |
| Chunk 5 | 11 |
| Chunk 6 | 13 |
| Total | 92 |

## Exit Criteria

- All mapped tests implemented and passing in target suites.
- `bun run verify` passes on each green chunk.
- `bun run green-verify` passes at each chunk handoff.
- `bun run verify-all` passes at epic completion.
- Manual gorilla pass completed for tab switching, mixed-provider sessions, and cancellation behavior.
