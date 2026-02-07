**Overall Readiness Verdict:** **READY WITH ISSUES**

**Critical Issues**
1. **TC-1.3b is in Story 1 scope but not covered by Story 1 tests/prompts.**  
Refs: `docs/feature-spec-mvp.md:154`, `docs/feature-spec-mvp.md:157`, `docs/stories/story-1-project-sidebar/story.md:53`, `docs/stories/story-1-project-sidebar/story.md:70`, `docs/stories/overview.md:32`, `docs/tech-design-mvp.md:2056`, `docs/tech-design-mvp.md:2062`  
Impact: acceptance/sign-off ambiguity for AC-1.3.

**Major Issues**
1. **TC-1.3a “session mappings retained” is claimed but not actually tested in Story 1 tests.**  
Refs: `docs/feature-spec-mvp.md:153`, `docs/stories/story-1-project-sidebar/story.md:61`, `docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md:207`, `docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md:212`  
Impact: traceability gap between TC intent and executable coverage.

2. **`server/index.ts` wiring is inconsistent across story/prompt docs.**  
Refs: `docs/stories/story-1-project-sidebar/story.md:46`, `docs/stories/story-1-project-sidebar/story.md:49`, `docs/stories/story-1-project-sidebar/prompt-1.2-green.md:110`, `docs/stories/story-1-project-sidebar/prompt-1.2-green.md:114`, `docs/stories/story-1-project-sidebar/prompt-1.R-verify.md:18`  
Impact: fresh-context engineer may miss required integration change.

3. **Red prompt is internally inconsistent on path strategy for tests.**  
Refs: `docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md:116`, `docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md:150`, `docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md:165`, `docs/stories/story-1-project-sidebar/prompt-1.2-green.md:117`, `docs/stories/story-1-project-sidebar/prompt-1.2-green.md:519`  
Impact: tests written in Red are likely not Green-ready without rework.

4. **Error contract is inconsistent between tech design and Story 1 prompt implementation guidance.**  
Refs: `docs/tech-design-mvp.md:1951`, `docs/tech-design-mvp.md:1957`, `docs/stories/story-1-project-sidebar/prompt-1.2-green.md:64`, `docs/stories/story-1-project-sidebar/prompt-1.2-green.md:266`  
Impact: interface drift risk for downstream stories relying on structured error codes.

**Minor Issues**
1. **Constraint conflict in Red prompt (`do not modify existing files` vs potential Vitest config edits).**  
Refs: `docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md:360`, `docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md:363`, `docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md:370`  
Impact: execution ambiguity.

2. **`removeProject` behavior for unknown ID is left ambiguous (“throw or silently succeed”).**  
Refs: `docs/stories/story-1-project-sidebar/prompt-1.2-green.md:139`  
Impact: nondeterministic behavior/testing expectations.

**Recommendations**
1. Resolve TC-1.3b explicitly: either add Story 1 coverage (likely integration) or mark it deferred with a concrete target story and update Story 1 scope/TC list accordingly.
2. Align file-change lists across `story.md`, Green prompt, and Verify prompt (especially `server/index.ts`).
3. Make Red prompt tests Green-compatible from the start (temp dirs/real existing paths), so Green doesn’t require test rewrites.
4. Decide one error contract for Story 1 (`message` only vs `code + message`) and align feature spec, tech design, and prompts.
5. Clarify unknown-project remove semantics and lock it in tests.