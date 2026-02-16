### 1) Verdict
NOT READY

### 2) Findings (primary output)

1. ID: `COH-001`  
Severity: Critical  
Title: Story 2b/Story 6 test ownership for `websocket.test.ts` is irreconcilable  
Evidence: `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/story.md:69`, `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/story.md:70`, `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/story.md:79`, `/Users/leemoore/code/liminal-builder/docs/stories/overview.md:34`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/story.md:17`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/story.md:76`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md:527`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md:39`  
Why it matters: Current docs cannot all be true at once (Story 2b claims 5 WS tests, Story 6 says 6 new, final table says file total is 6), so cumulative totals and ownership are mathematically broken.  
Recommended fix: Choose one canonical model for `tests/server/websocket.test.ts` ownership/additivity, then recalc and rewrite Story 2b/4/6 + overview + final verify totals from that model.  
Effort: Medium  
Value: High

2. ID: `COH-002`  
Severity: Critical  
Title: Story 6 prompt snippets violate canonical `SessionManager` constructor contract  
Evidence: `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/story.md:9`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md:108`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md:109`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md:110`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md:111`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md:226`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:400`  
Why it matters: Following Story 6 prompt code as written will produce contract-incompatible setup and likely broken tests/implementation flow.  
Recommended fix: Update both Story 6 prompt snippets to construct `SessionManager(store, agentManager, projectStore)` and align object creation order accordingly.  
Effort: Low  
Value: High

3. ID: `COH-003`  
Severity: Major  
Title: `verify` / `verify-all` script contracts in docs are stale vs `package.json`  
Evidence: `/Users/leemoore/code/liminal-builder/package.json:22`, `/Users/leemoore/code/liminal-builder/package.json:23`, `/Users/leemoore/code/liminal-builder/package.json:15`, `/Users/leemoore/code/liminal-builder/package.json:17`, `/Users/leemoore/code/liminal-builder/package.json:19`, `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/story.md:19`, `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/story.md:20`, `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/story.md:102`, `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/story.md:105`, `/Users/leemoore/code/liminal-builder/docs/stories/overview.md:65`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2042`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2043`  
Why it matters: Verify-phase expectations and CI gate narratives differ from executable truth, causing false audit checks and wrong handoff guidance.  
Recommended fix: Normalize all docs to the exact current script chains in `package.json` (including `lint:eslint`, `test:eslint-plugin`, and `test:client` in `verify-all`).  
Effort: Low  
Value: High

4. ID: `COH-004`  
Severity: Major  
Title: Dependency baseline in docs diverges from actual runtime dependencies  
Evidence: `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/story.md:21`, `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/prompt-0.1-setup.md:100`, `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/prompt-0.1-setup.md:103`, `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/prompt-0.1-setup.md:104`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2021`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2022`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2023`, `/Users/leemoore/code/liminal-builder/package.json:25`, `/Users/leemoore/code/liminal-builder/package.json:26`, `/Users/leemoore/code/liminal-builder/package.json:27`, `/Users/leemoore/code/liminal-builder/package.json:28`, `/Users/leemoore/code/liminal-builder/package.json:29`, `/Users/leemoore/code/liminal-builder/package.json:30`, `/Users/leemoore/code/liminal-builder/package.json:31`  
Why it matters: Setup prompts and design references describe a dependency contract that the repository does not currently implement.  
Recommended fix: Decide source of truth (docs vs package). Then either add the missing deps in code or remove/annotate them everywhere in docs.  
Effort: Medium  
Value: Medium

5. ID: `COH-005`  
Severity: Major  
Title: Test-count trajectory drifts across Story 3/5/6 and tech design self-check  
Evidence: `/Users/leemoore/code/liminal-builder/docs/stories/story-3-chat-ui/story.md:18`, `/Users/leemoore/code/liminal-builder/docs/stories/story-3-chat-ui/story.md:75`, `/Users/leemoore/code/liminal-builder/docs/stories/story-3-chat-ui/story.md:87`, `/Users/leemoore/code/liminal-builder/docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md:24`, `/Users/leemoore/code/liminal-builder/docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md:328`, `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/story.md:79`, `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/story.md:80`, `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/story.md:92`, `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/prompt-5.R-verify.md:14`, `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/prompt-5.R-verify.md:124`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/story.md:16`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/story.md:97`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2094`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2106`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2322`  
Why it matters: Red/Green/Verify gates are inconsistent, so teams cannot reliably know pass/fail baselines per phase.  
Recommended fix: Pick one canonical story trajectory and update every prerequisite, cumulative table, verify checklist, and self-audit line to that exact sequence.  
Effort: Medium  
Value: High

6. ID: `COH-006`  
Severity: Major  
Title: Story 2a baseline/TC trace drifts to “8 tests” in downstream docs  
Evidence: `/Users/leemoore/code/liminal-builder/docs/stories/story-2a-acp-client/story.md:32`, `/Users/leemoore/code/liminal-builder/docs/stories/story-2a-acp-client/story.md:52`, `/Users/leemoore/code/liminal-builder/docs/stories/story-2a-acp-client/story.md:54`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2094`, `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/prompt-2b.R-verify.md:34`, `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/prompt-2b.R-verify.md:206`  
Why it matters: Regression gates and traceability references undercount Story 2a and omit explicit mention of `sessionCancel` semantics coverage.  
Recommended fix: Update all Story 2a baseline references to 9 and sync TC/test descriptions accordingly.  
Effort: Low  
Value: Medium

7. ID: `COH-007`  
Severity: Major  
Title: `error` message contract is inconsistent on `requestId` correlation  
Evidence: `/Users/leemoore/code/liminal-builder/docs/feature-spec-mvp.md:596`, `/Users/leemoore/code/liminal-builder/docs/feature-spec-mvp.md:630`, `/Users/leemoore/code/liminal-builder/docs/feature-spec-mvp.md:649`, `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/story.md:77`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md:203`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:1951`  
Why it matters: Correlation guarantees for concurrent requests become ambiguous, especially for failure paths.  
Recommended fix: Make one explicit on-wire contract (`error` includes optional `requestId`) and align feature spec, tech design, story docs, and prompt snippets to it.  
Effort: Medium  
Value: High

8. ID: `COH-008`  
Severity: Major  
Title: Story 6 execution-order dependency conflicts across docs  
Evidence: `/Users/leemoore/code/liminal-builder/docs/stories/overview.md:25`, `/Users/leemoore/code/liminal-builder/docs/feature-spec-mvp.md:908`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2272`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2275`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/story.md:16`  
Why it matters: One set of docs says Story 6 must wait for Story 5; another says Story 6 branches directly from Story 2b. That causes orchestration and planning conflicts.  
Recommended fix: Distinguish `architectural prerequisite` vs `execution gate` explicitly, and make all dependency graphs/state text match.  
Effort: Medium  
Value: High

9. ID: `COH-009`  
Severity: Major  
Title: Session list assembly contract is self-contradictory in tech design  
Evidence: `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:634`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:638`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:646`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2191`, `/Users/leemoore/code/liminal-builder/docs/feature-spec-mvp.md:83`, `/Users/leemoore/code/liminal-builder/docs/feature-spec-mvp.md:176`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/story.md:5`  
Why it matters: It alternates between “local + ACP join” and “entirely local (no ACP `session/list`)”, which can drive incompatible implementations.  
Recommended fix: Keep only the local-authority model everywhere in tech design and remove ACP-join wording.  
Effort: Medium  
Value: High

10. ID: `COH-010`  
Severity: Minor  
Title: AC ownership for AC-5.2 is inconsistent between Story 2b and overview/tech summaries  
Evidence: `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/story.md:22`, `/Users/leemoore/code/liminal-builder/docs/stories/overview.md:34`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2114`  
Why it matters: Traceability is blurry on whether AC-5.2 is partially delivered in Story 2b or fully deferred to Story 6 UI.  
Recommended fix: Add one explicit note in overview/tech (partial server-state coverage in 2b, UI completion in 6) or remove the partial-coverage claim from Story 2b.  
Effort: Low  
Value: Medium

### 3) Low-effort/value patch set

1. `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/prompt-6.2-green.md`  
Change summary: Fix `SessionManager` instantiation snippets to the canonical 3-argument constructor (`store, agentManager, projectStore`).

2. `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/story.md`, `/Users/leemoore/code/liminal-builder/docs/stories/overview.md`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md`  
Change summary: Replace stale `verify`/`verify-all` decomposition text with exact `package.json` script chains.

3. `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md`, `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/prompt-2b.R-verify.md`  
Change summary: Update Story 2a baseline from 8 to 9 tests and reflect `sessionCancel` coverage consistently.

4. `/Users/leemoore/code/liminal-builder/docs/stories/overview.md`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md`  
Change summary: Clarify AC-5.2 as partial server-state scope in Story 2b and UI-complete scope in Story 6 (or remove partial claim from Story 2b).

### 4) Medium/High-effort backlog

1. `COH-001` + `COH-005` (test ownership/count normalization)  
Tradeoff: Keeping final total `79` likely requires re-scoping Story 2b WS test claims; preserving Story 2b “+5 WS tests” requires broad cumulative-total rewrites.  
Suggested sequencing: Resolve this first; all phase gates and readiness numbers depend on it.

2. `COH-007` + `COH-009` (contract normalization: error/requestId + session-list authority)  
Tradeoff: Small wording changes, but high impact on implementation contracts and regression expectations.  
Suggested sequencing: Resolve immediately after test-count normalization, before any new prompt-pack execution.

3. `COH-008` (dependency model unification)  
Tradeoff: Need to choose one orchestration model (strict sequential execution vs architectural branching with explicit operational gate).  
Suggested sequencing: Resolve after contract cleanup so scheduling language references stable story outputs.

4. `COH-004` (dependency baseline reconciliation)  
Tradeoff: Either update docs to current package state (fast) or reintroduce dependencies in runtime stack (broader code/testing impact).  
Suggested sequencing: Resolve after dependency/order decisions, before next setup-oriented prompt run.

### 5) Consistency matrix

| Story | Internally coherent? | Coherent with feature spec? | Coherent with tech design? | Coherent with overview/dependencies? | Notes |
|---|---|---|---|---|---|
| 0 | Y | Y | Y | Y | Internally consistent, but script/dependency baseline is stale vs `/Users/leemoore/code/liminal-builder/package.json`. |
| 1 | Y | Y | Y | Y | Deferred TC documentation is coherent with downstream references. |
| 2a | Y | Y | N | Y | Story says 9 tests; tech/verify references still include stale 8-test baseline. |
| 2b | Y | Y | N | N | Story claims 10 + 5 WS tests; overview/tech/downstream totals treat Story 2b as 10. |
| 3 | N | Y | N | N | Internal 27/28 and 44/45 drift breaks phase and cumulative coherence. |
| 4 | Y | Y | N | Y | Story is local-only for session listing; tech design has conflicting ACP-join wording. |
| 5 | N | Y | N | N | 71 vs 72 and 57 vs 58 baseline drift across story and verify docs. |
| 6 | N | Y | N | N | Previous-total drift (71 vs 72) and dependency language conflicts with tech graph. |

### 6) Final readiness statement

Execution should not proceed yet. The first blockers are `COH-001` and `COH-002` because they break test-accounting integrity and prompt-level implementation contracts; after that, normalize the test trajectory (`COH-005`/`COH-006`) and then align core contracts/dependencies (`COH-007`, `COH-008`, `COH-009`, `COH-004`). All required Liminal Spec skill/reference files (including both optional prompting refs) were available in this audit run.