# Context Memory / Core Data — Ideation Braindump

**Date:** 2026-02-06
**Context:** Explored during liminal-builder Phase 2 spec work. Conversation between Lee and Opus 4.6 in Claude Code.
**Status:** Raw exploration, not spec'd. Lee has 6-8 months of systems design iteration behind this topic — this doc captures only what surfaced in this conversation, not the full picture.

---

## The Problem

Claude Code (and other CLI harnesses) manage their own context. You can't control what the model sees without either:

1. Forking the harness (not possible for Claude Code, not desirable in general)
2. Building your own harness (keeps failing — you fall into the hole of recreating execution infrastructure)
3. Finding a point of indirection where you can manage context while using existing harnesses for execution

Option 3 is the goal. Liminal-builder + ACP might provide that indirection point.

---

## Key Insight: CLI Session Files as Materialized Views

CLI session files (e.g., Claude Code's JSONL in `~/.claude/`) are NOT the system of record in this architecture. They are **materialized views** — disposable representations that Liminal Builder writes for the CLI to consume.

The real system of record is a persistence layer (Convex) that stores full archival history and all context management metadata. The CLI session file is just what the model currently needs to see.

```
Convex (system of record)
  ├── Full archival history (every message, every tool call, forever)
  ├── Compression gradient metadata (what fidelity level each chunk is at)
  ├── Memory graph (consolidated lessons, tickles, references)
  └── Session state (what the CLI currently "sees")
         │
         │  materialize
         ▼
CLI session file (disposable view)
  └── Written by Liminal Builder
      Read by CLI harness
      Overwritten whenever context needs change
         │
         │  ACP (communication)
         ▼
CLI harness (Claude Code, Codex, etc.)
  └── Does what it's good at:
      tool execution, permissions, model interaction
```

This decouples context ownership from execution. You stop trying to build your own harness because you don't need to — the CLIs are great execution engines. You just need to own what they see.

---

## What ACP Actually Controls (and Doesn't)

ACP is a **communication channel**, not a context construction layer.

```
You (UI) → ACP → CLI Harness → API
                    ↑
              CLI owns context.
              It reads from its own session state.
              ACP just passes messages through.
```

You cannot hand a curated history through ACP and have the CLI use it. The CLI manages its own context from its own session files.

**What ACP gives you in this architecture:**

1. **Observation** — every message flowing through gets indexed into Convex (system of record fills naturally)
2. **Session lifecycle control** — close/open sessions to trigger the file rewrite (the swap mechanic)
3. **Multi-CLI abstraction** — same observation pipeline regardless of which CLI is underneath

**What ACP does NOT give you:**

- Context construction
- History injection
- Ability to modify what the model sees mid-session

---

## The Two-Layer Indirection

Context management requires two layers, not one:

1. **ACP layer** (observation + routing) — tracks all messages, indexes into persistent store, triggers maintenance cycles
2. **File layer** (mutation) — reads CLI session files, applies compression gradient, writes curated version with new session ID, swaps sessions

The combination is what makes Liminal Builder the right insertion point. Neither layer alone is sufficient.

---

## The Swap Mechanic

How context changes are applied. Periodically (every 5-10 turns, or threshold-based when context crosses ~120k tokens):

1. ACP layer signals "maintenance cycle"
2. Read CLI's current session file (full fidelity, what the model actually has)
3. Apply compression gradient logic (see below)
4. Write new session file with new ID
5. Close current ACP session, open new one (CLI loads the curated file)
6. UI masks the swap — same tab, same thread name, brief "optimizing..." indicator

**The user never sees session IDs.** They see their thread. The swap is invisible. Liminal Builder's session-to-project mapping abstraction makes the backing session ID disposable.

**KV cache tradeoff:** Every swap = full KV cache rebuild. At 100k tokens that's real latency. The 5-10 turn cadence (or threshold-based trigger) is the knob — trading periodic cache miss for stable context size. Updates happen every 5-10 turns specifically to reduce KV cache misses. Between swaps, the CLI runs normally with full KV cache benefits.

---

## The Compression Gradient

Context stabilized at ~100k tokens with ~20k leeway. History managed at different fidelity levels:

**Tool call gradient:**
- Full content (recent)
- Truncated to ~120 chars (middle)
- Removed entirely (old)

**Message gradient:**
- Full fidelity (recent turns)
- Summarized/compressed (middle)
- Consolidated into context preamble (ancient — can go back weeks or months, millions or tens of millions of tokens, smartly compressed)

The gradient keeps the most recent history at highest fidelity and allows low-fidelity early parts to reach far back in time. The automated system keeps up with the gradient, maintaining history in a balanced stasis.

---

## The Tracking / Injection Pipeline

Multi-stage pipeline for deciding what gets injected into the dynamic context zone.

### Stage 1: Deterministic (cheap, fast, dumb)

Multiple retrieval systems surface candidates:

- **Transcription matches** — keyword/pattern matching against history
- **Consolidated memory matches** — embedding similarity against memory graph
- **Reference layer matches** — structured lookups
- **Memory tickles** — association triggers. Format: "this conversation reminds me of xyz conversation with the user {call getMem('423343223') to retrieve memory or consolidated lesson}." The subsystems inject the tickle; the model decides whether to grab.

These are dumb deterministic work and dumb model ranking. They produce a ranked short list.

### Stage 2: Fast Model Review (big context, quick judgment)

A smaller, faster, big-context model:

- Tracks a medium-fidelity version of the context
- Has high-fidelity last 5 turns
- Reviews the ranked items surfaced by Stage 1
- Makes judgments about what to include in the dynamic sections
- Acts as final filter on what gets injected into the TTL dynamic layer

### Stage 3: Injection + Model Tools

Approved items go into the dynamic zone of the materialized view. Additionally, the model itself has tools to:

- **Pull higher fidelity** — when it encounters compressed history chunks, it can request the full version from the persistence layer
- **Pull memory tickles** — retrieve the full memory a tickle references
- **Dump search results** — when large numbers of search results surface, dump them into Redis with a quick retrieval ID, a summary, and the key for further retrieval as needed

---

## Context Layout (Materialized View Structure)

```
[System preamble]
[Compressed ancient history — consolidated summaries]
[Medium-fidelity middle history — tool-stripped]
[DYNAMIC ZONE — memory tickles, retrieved context, TTL entries]
[Full-fidelity recent turns — last 5-10]
[Current user message]
```

The dynamic zone sits between compressed history and recent turns. It's specified for the tracking model to manage — injection points between current turn and previous turns. TTL zone for quick-access things like memory retrievals and tickles.

---

## Persistence Architecture

Three storage systems, each for what it's good at:

**Convex** — system of record
- Full archival history
- Relational data storage
- Search and retrieval
- Compression gradient metadata
- Memory graph

**Redis** — ephemeral and streaming
- Big chunks of text, keyed and TTL'd
- Search result dumps (keyed with summary for model retrieval)
- Redis streams for async messaging or more robust streaming as needed

**CLI session files** — disposable materialized views
- Written by Liminal Builder from Convex data
- Read by CLI harness at session start
- Overwritten whenever context needs change
- NOT the system of record

---

## Relationship to Liminal Builder MVP

The MVP establishes the foundations this system layers onto:

- ACP process management → observation point for indexing all messages
- Session-to-project mapping → abstraction over disposable CLI session IDs (enables invisible swaps)
- WebSocket message flow → visibility into everything flowing through
- Local metadata store → upgrades to Convex later

The context management system layers on top without changing the core architecture. MVP starts with simple local storage. Context kernel upgrades the persistence and adds the compression/injection pipeline.

**The initial entry point is tool call context management** (compression gradient for tool calls, similar to what ccs-cloner does today). Then message history management (fidelity gradient, stabilize context size). Then dynamic injection (the tracking pipeline, memory tickles, etc.). Built incrementally on the same foundation.

---

## Why This Works (and Previous Approaches Didn't)

Previous approaches failed because owning context meant owning execution — building a full coding harness to replace Claude Code, Codex, etc. The quality loss from a custom harness wasn't worth the context control gained.

This approach separates the concerns:

- **CLI harnesses own execution** — tool calls, permissions, model interaction, all the hard stuff they've already built
- **Liminal Builder owns context** — what the model sees, how history is managed, what gets injected
- **The file layer is the interface** — a dumb pipe between the system of record and the execution engine

ACP provides structured observation without requiring you to intercept or rewrite the execution path. File-level manipulation provides context control without requiring you to rebuild the harness. The combination gives you both execution quality and context sophistication.

---

## Open Questions (Not Explored in This Conversation)

- Codex and Gemini session file formats — same pattern as Claude Code, but file-level details unknown
- The tracking model's specific model choice, context budget, inference cost per cycle
- How the memory graph is structured in Convex (Lee has more detail from 6-8 months of iteration)
- Exact TTL policies for Redis entries
- How the dynamic zone interacts with the CLI's own system prompts
- Multi-session scenarios: does the tracking model manage one gradient per session or a shared memory layer across sessions?
- Edge cases around concurrent swaps if multiple sessions are active
