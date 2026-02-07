# Story Sharding: Liminal Builder MVP

## Execution Plan

8 stories (0–6, with 2a/2b split) delivering 79 tests across 10 test files. Stories follow the TDD execution cycle: Skeleton → Red → Green → Gorilla → Verify.

## Story Dependency Graph

```
Story 0 (Infrastructure)
    ├──→ Story 1 (Project Sidebar)         [9 tests]
    └──→ Story 2a (ACP Client)             [9 tests]
              ↓
         Story 2b (Agent Manager + WS)     [10 tests]
              ↓
         Story 3 (Chat UI)                  [17 tests]
              ↓
         Story 4 (Sessions)                 [13 tests]
              ↓
         Story 5 (Tabs)                     [14 tests]
              ↓
         Story 6 (Codex + Status)           [7 tests]
```

**Parallelism:** Stories 1 and 2a can execute in parallel after Story 0. Stories 3-6 run sequentially, and Story 6 starts only after Story 5 (Stories 0-5 complete).

## Stories

| Story | Title | ACs | Tests | Running Total |
|-------|-------|-----|-------|---------------|
| 0 | Infrastructure & Project Skeleton | — | 0 | 0 |
| 1 | Project Sidebar | AC-1.1–1.4 | 9 | 9 |
| 2a | ACP Client (Protocol Layer) | AC-5.1 (partial), AC-5.3 (partial) | 9 | 18 |
| 2b | Agent Manager + WebSocket Bridge | AC-5.1, AC-5.3, AC-5.5 | 10 | 28 |
| 3 | Chat Session UI | AC-3.1–3.7, AC-5.4 | 17 | 45 |
| 4 | Session Management | AC-2.1–2.5 | 13 | 58 |
| 5 | Tab Management | AC-4.1–4.7 | 14 | 72 |
| 6 | Codex CLI + Connection Status + Integration | AC-5.2, AC-5.6 | 7 | 79 |

## Prompt Pack Structure

Each story directory contains:

```
story-N-{description}/
├── story.md                    # Overview, ACs, TCs, files, test breakdown
├── prompt-N.1-skeleton-red.md  # Stubs + tests (or setup for Story 0)
├── prompt-N.2-green.md         # Implementation (Stories 1+ only)
└── prompt-N.R-verify.md        # Verification checklist
```

## Execution Model

- **Orchestrator (Opus 4.6):** Manages story flow, validates transitions, coordinates agents
- **Senior Engineer (Claude Code subagent):** Executes each prompt in a fresh context
- **Verifier (GPT 5x / Codex):** Reviews implementation against spec

## Test + Verify Commands

- Test execution is Vitest-based. Always use the canonical package.json scripts.
- **Server tests:** `bun run test` (runs `vitest run tests/server`)
- **Client tests:** `bun run test:client` (runs `vitest run tests/client`)
- **Integration tests:** `bun run test:integration` (runs `vitest run tests/integration`)
- Verify-phase script tiers:
  - `bun run verify` = format:check + lint + typecheck + `bun run test`
  - `bun run verify-all` = `bun run verify` + `bun run test:client` + `bun run test:integration` + `bun run test:e2e`
- Each story's verify prompt (`prompt-N.R-verify.md`) must end on `bun run verify` or `bun run verify-all` as the final gate.

## Reference Documents

- PRD: `docs/prd.md`
- Feature Spec: `docs/feature-spec-mvp.md`
- Tech Design: `docs/tech-design-mvp.md`
