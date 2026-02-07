**Overall readiness verdict:** **NOT READY**

**Assessment summary**
1. Traceability: Fails. Story 2a claims AC coverage that does not cleanly map to Flow 5 TCs and tests.
2. Prompt completeness: Partial. Prompts are detailed but contain conflicting instructions.
3. Consistency: Fails in a few key places (spawn ownership, constructor behavior, instruction precedence).
4. Dependencies: Story 0 references are mostly correct, but Story 1 dependency conflicts with the story graph.
5. Test coverage: Insufficient for critical behavior (`close`, `sessionCancel`) and TC-level traceability.
6. Gaps/issues: Multiple blockers below.

**Critical issues**
- AC/TC traceability is broken for Story 2a scope. Story claims AC-5.1/5.3 partial coverage, but Flow 5 TCs for those ACs are process lifecycle behaviors mapped to `agent-manager.test.ts`, not `acp-client.test.ts`. Refs: `docs/stories/story-2a-acp-client/story.md:21`, `docs/stories/story-2a-acp-client/story.md:22`, `docs/feature-spec-mvp.md:487`, `docs/feature-spec-mvp.md:491`, `docs/feature-spec-mvp.md:517`, `docs/tech-design-mvp.md:1130`, `docs/tech-design-mvp.md:1131`, `docs/tech-design-mvp.md:1136`.
- The Red test for graceful close has no real assertion, so AC-5.3 partial coverage can false-pass. Refs: `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md:614`, `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md:623`, `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md:626`.

**Major issues**
- Dependency contradiction: graph says Story 2a can run after Story 0 in parallel with Story 1, but Story 2a docs/prompts require Story 1 complete. Refs: `docs/stories/overview.md:25`, `docs/tech-design-mvp.md:2275`, `docs/stories/story-2a-acp-client/story.md:14`, `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md:17`, `docs/stories/story-2a-acp-client/prompt-2a.2-green.md:17`.
- Spawn ownership is inconsistent across artifacts. Feature spec/tech design Story 2a mention spawning, but implementation prompts only target `AcpClient` over provided stdio; spawn is shown in AgentManager flow. Refs: `docs/feature-spec-mvp.md:774`, `docs/tech-design-mvp.md:2084`, `docs/tech-design-mvp.md:1088`, `docs/stories/story-2a-acp-client/story.md:5`, `docs/stories/story-2a-acp-client/prompt-2a.2-green.md:30`.
- `sessionCancel` is required but not covered by an automated test in the 8-test pack; only conceptual/manual checks mention it. Refs: `docs/stories/story-2a-acp-client/story.md:9`, `docs/stories/story-2a-acp-client/story.md:73`, `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md:385`, `docs/stories/story-2a-acp-client/prompt-2a.R-verify.md:110`.
- Prompt 2a.1 has contradictory constructor guidance (throw vs must not throw). Refs: `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md:173`, `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md:638`.
- Prompt 2a.2 says `close()` should wait for exit, but template implementation does not actually wait. Refs: `docs/stories/story-2a-acp-client/prompt-2a.2-green.md:247`, `docs/stories/story-2a-acp-client/prompt-2a.2-green.md:377`.

**Minor issues**
- Instruction precedence conflicts in prompts can cause drift (`do not modify other files` vs allow test edits; tests as source of truth vs spec/design as source of truth). Refs: `docs/stories/story-2a-acp-client/prompt-2a.2-green.md:32`, `docs/stories/story-2a-acp-client/prompt-2a.2-green.md:550`, `docs/stories/story-2a-acp-client/prompt-2a.2-green.md:559`, `docs/stories/story-2a-acp-client/prompt-2a.2-green.md:562`.
- Prompt 2a.1 has a similar conflict (`do not modify acp-types` vs “add missing types if blocked”). Refs: `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md:645`, `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md:652`.

**Recommendations**
1. Re-baseline Story 2a traceability with explicit mappings: AC/TC subset (or story-specific derived TCs) -> each test case.
2. Decide ownership of process spawn/shutdown semantics: either move all lifecycle TCs to Story 2b or add explicit 2a tests and prompt steps for spawn-related behavior.
3. Fix prompt contradictions (constructor behavior, source-of-truth precedence, file-modification rules).
4. Strengthen tests: add explicit assertions for `close()` behavior and add an automated `sessionCancel` test.
5. Align dependencies to Story 0 only (or update graph/docs if Story 1 is truly required).