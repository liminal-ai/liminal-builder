# Story 7: Codex Streaming Batch Alignment — Pairing Session Prompt

## Project Context

**Liminal Builder** is an agentic IDE wrapping AI coding CLIs in a browser chat interface. It has two CLI providers:

- **Claude Code** — via `@anthropic-ai/claude-agent-sdk`, emits streaming content with server-side token batching
- **Codex** — via ACP (JSON-RPC over stdio), currently emits every chunk immediately with no batching

Both providers emit `UpsertObject` messages that carry the **full accumulated content** on each update (not diffs). This means the total bytes sent scales quadratically with response length if updates are too frequent.

## The Problem (Verified)

**Claude Code provider** (`claude-sdk-provider.ts`):
- Uses `BufferedTextBlockState` (line 141-149) with fields: `kind`, `itemId`, `content`, `sourceTimestamp`, `emittedTokenCount`, `batchIndex`, `hasEmittedCreate`
- Batch gradient: `DEFAULT_BATCH_GRADIENT = [10, 20, 40, 80, 120]` (line 199)
- Token counting: `countBatchTokens(text)` = `(text.match(/\S+/g) ?? []).length` — whitespace-delimited word count (line 973-975)
- Threshold check in `handleContentBlockDelta` (lines 707-723): only emits when unemitted tokens exceed current threshold
- `advanceBatchIndex` (lines 955-971): progresses through gradient as tokens accumulate
- `emitBufferedUpsert` (lines 903-936): emits with `create` or `update` status
- A 1000-word response produces ~5-7 upserts.

**Codex provider** (`codex-acp-provider.ts`):
- `handleAgentMessageChunk` (lines 446-496): every ACP `agent_message_chunk` event immediately appends to `session.activeMessage.content` and emits a full upsert
- No `BufferedTextBlockState` equivalent, no token counting, no thresholds
- `CodexSessionState.activeMessage` (line 50-54) tracks only `itemId`, `content`, `sourceTimestamp` — no batch state fields
- A 1000-token response where ACP sends per-token chunks produces ~1000 upserts, each carrying the growing string — roughly 500K tokens of cumulative WebSocket traffic for a 1K response

## Key Files

- `server/providers/codex/codex-acp-provider.ts` — Primary file to modify:
  - `CodexSessionState` (line 34-65): needs batch state fields
  - `handleAgentMessageChunk()` (lines 446-496): needs batching logic
  - `emitTerminalMessage()` (lines 752-777): flushes remaining content on turn complete/error — needs to flush any buffered-but-unemitted content
- `server/providers/claude/claude-sdk-provider.ts` — Reference implementation:
  - `BufferedTextBlockState` (line 141-149): the batch state type
  - `DEFAULT_BATCH_GRADIENT` (line 199): `[10, 20, 40, 80, 120]`
  - `countBatchTokens()` (line 973): token proxy
  - `getCurrentBatchThreshold()` (line 950): gradient lookup
  - `advanceBatchIndex()` (line 955): progression logic
  - `handleContentBlockDelta()` (lines 707-723): the threshold check pattern
- `server/streaming/upsert-types.ts` — `UpsertObject` type (unchanged)
- `tests/server/providers/codex-acp-provider.test.ts` — Needs new batching tests
- `tests/server/providers/claude-sdk-provider.test.ts` — Reference for batching test patterns

## What We're Working On

Bringing the Codex provider's emission pattern in line with the Claude provider's batching approach.

Concrete work:
1. Add batch state fields to `CodexSessionState` or to `activeMessage` — `emittedTokenCount`, `batchIndex`, `hasEmittedCreate`
2. In `handleAgentMessageChunk`: accumulate content but only emit when token count exceeds threshold
3. On first threshold hit, emit with `status: "create"`. On subsequent hits, emit with `status: "update"`.
4. In `emitTerminalMessage`: flush any remaining buffered content before the terminal `complete`/`error` upsert
5. Add tests verifying batching behavior at threshold boundaries

## Things to Consider

- **Simpler model than Claude provider.** The Codex provider has one active message at a time (no multi-block model, no index-based tracking). The batching can be a flat addition to `handleAgentMessageChunk` without the block-state map complexity.
- **Extract or duplicate?** The batching functions (`countBatchTokens`, `getCurrentBatchThreshold`, `advanceBatchIndex`) could be extracted to a shared utility. But this is three small pure functions — duplicating the ~25 lines is arguably cleaner than creating a shared module prematurely, especially if the providers might diverge on batching strategy later. [OPEN: discuss in session — lean toward extract if it's clean, duplicate if it's awkward.]
- **`emitTerminalMessage` flush order matters.** Currently it emits the terminal message upsert directly. After batching, it needs to: (a) emit any buffered-but-unemitted content as a final `update`, then (b) emit the terminal `complete`/`error`. Otherwise the client might miss the tail of the content.
- **Test strategy:** Mirror the Claude provider test patterns — verify that N chunks produce a controlled number of upserts, verify threshold boundaries, verify terminal flush includes buffered content.

## Confidence Notes

What's verified (read the code):
- `DEFAULT_BATCH_GRADIENT = [10, 20, 40, 80, 120]` — confirmed at claude-sdk-provider.ts line 199.
- `countBatchTokens` uses `text.match(/\S+/g)?.length` — confirmed at line 973-975.
- Codex `handleAgentMessageChunk` emits on every chunk with no batching — confirmed at lines 446-496. Each chunk appends to `activeMessage.content` and immediately calls `emitUpsert`.
- `CodexSessionState.activeMessage` has no batch fields — confirmed at lines 50-54.
- `emitTerminalMessage` emits the activeMessage content directly — confirmed at lines 752-777.
- `BufferedTextBlockState` fields list — confirmed at claude-sdk-provider.ts lines 141-149.

What needs verification in session:
- Whether the Codex ACP adapter actually sends per-token chunks or larger chunks. The batching fix is needed regardless, but the severity of the current problem depends on ACP's actual granularity. (~60% confident it's per-token or very small chunks based on the user's description of jittery Codex streaming, but haven't observed ACP output directly.)
- Whether `claude-sdk-provider.test.ts` has explicit batch threshold tests that can be mirrored. (~80% confident given the batch logic is well-structured, but didn't read the test file.)

## Session Style

This is an interactive pairing session. The scope is well-defined but there are design decisions around code sharing vs. duplication. We'll discuss the approach, implement, and verify with tests.
