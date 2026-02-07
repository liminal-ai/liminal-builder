**Overall Readiness Verdict:** **NOT READY**

**Traceability / Coverage Summary (Story 2b only)**
- AC traceability is mostly present for `AC-5.1`, `AC-5.3`, `AC-5.5` via Story 2b (`docs/stories/story-2b-agent-manager/story.md:22`, `docs/stories/story-2b-agent-manager/story.md:24`, `docs/stories/story-2b-agent-manager/story.md:25`), matching feature spec Story 2b mapping (`docs/feature-spec-mvp.md:786`).
- TC coverage is strong for AgentManager (10 tests explicitly listed), but WebSocket coverage is under-specified (no concrete test count/assertions in story doc).

**Issues Found**

### Critical
1. **WebSocket contract contradiction (`error` vs `agent:error`)**
- Feature spec server contract defines `type: 'error'` (`docs/feature-spec-mvp.md:630`).
- Tech design server mapping also defines `error` (`docs/tech-design-mvp.md:553`).
- Story/prompts require forwarding as `agent:error` (`docs/stories/story-2b-agent-manager/story.md:94`, `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md:474`, `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:243`, `docs/stories/story-2b-agent-manager/prompt-2b.R-verify.md:152`).
- Prompt also says “keep existing WS payload contracts stable” while introducing `agent:error` (`docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:247`).

2. **Type-level contradiction in prompt templates (will fail typecheck if followed literally)**
- `CliType` is `'claude-code' | 'codex'` (`docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:70`).
- Template uses `Record<CliType, ...>` but only provides `'claude-code'` key (`docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:92`, `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:274`; same pattern in red prompt `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md:161`).
- Same prompt forbids adding codex runtime config (`docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:516`) and still expects zero type errors (`docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:555`).

### Major
1. **Dependency gating inconsistent with story graph and your stated assumption (Stories 0 + 2a complete)**
- Graph says Stories 1 and 2a can run in parallel; 2b depends on 2a (`docs/stories/overview.md:25`).
- Story 2b and prompts require Story 1 completion/tests (`docs/stories/story-2b-agent-manager/story.md:14`, `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md:19`, `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:19`).

2. **WebSocket test scope not implementation-ready**
- Story lists WS test scope without concrete count/cases (`docs/stories/story-2b-agent-manager/story.md:71`).
- Red prompt gives only high-level WS bullets, unlike the fully specified AgentManager tests (`docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md:469`).

3. **Reconnect interface naming inconsistency in tech design**
- One section uses `manualReconnect` (`docs/tech-design-mvp.md:1070`, `docs/tech-design-mvp.md:534`).
- Interface section uses `reconnect` (`docs/tech-design-mvp.md:1448`).
- Prompts implement `reconnect` (`docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md:125`).

### Minor
1. **AC scope labeling drift**
- Feature spec Story 2b ACs are 5.1/5.3/5.5 (`docs/feature-spec-mvp.md:786`).
- Story 2b adds AC-5.2 partial in-table (`docs/stories/story-2b-agent-manager/story.md:23`), which is fine as extra coverage but should be explicitly marked as “bonus/partial.”

2. **Claude-only routing is explicit, but codex behavior is not defined**
- Prompts hardcode `ensureAgent('claude-code')` for all routed session ops (`docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:236`).
- Client contract still includes `cliType` on `session:create` (`docs/feature-spec-mvp.md:604`).
- Missing explicit “unsupported cliType” behavior for Story 2b.

**Recommendations**
1. Normalize WS error contract now: use `error` end-to-end for Story 2b (or formally update spec/design to add `agent:error`).
2. Fix prompt typing conflict: replace `Record<CliType, ...>` with `Partial<Record<CliType, ...>>` for Story 2b, or include a codex placeholder entry.
3. Remove Story 1 as a hard prerequisite for Story 2b; keep Story 1 checks optional regression gates.
4. Expand WS red tests to concrete, numbered cases with expected payloads (including error payload shape and routing assertions).
5. Align reconnect method naming across design and prompts (`reconnect` vs `manualReconnect`).
6. Add explicit Story 2b behavior for unsupported `cliType` values (deterministic error).