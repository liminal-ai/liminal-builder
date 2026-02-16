### 1) Verdict
NOT READY

All required Liminal Spec reference files were available and loaded.

### 2) Findings (primary output)

**Critical**

1.  
ID: `COH-001`  
Severity: Critical  
Title: Tech design test-count backbone conflicts with story overview and stated final plan  
Evidence: `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2094`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2106`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2165`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2195`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2222`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2322`, `/Users/leemoore/code/liminal-builder/docs/stories/overview.md:33`, `/Users/leemoore/code/liminal-builder/docs/stories/overview.md:35`, `/Users/leemoore/code/liminal-builder/docs/stories/overview.md:37`  
Why it matters: Execution baselines and running totals diverge (8/17/44/57/71 vs 9/18/45/58/72), so validation gates and downstream planning are unreliable.  
Recommended fix: Normalize all docs to one canonical sequence and update every running-total mention consistently.  
Effort: Medium  
Value: High

2.  
ID: `COH-002`  
Severity: Critical  
Title: Story 2b websocket test ownership/count is contradictory and breaks 79-test reconciliation logic  
Evidence: `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/story.md:69`, `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/story.md:70`, `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/story.md:79`, `/Users/leemoore/code/liminal-builder/docs/stories/overview.md:34`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md:39`  
Why it matters: Story 2b is listed as 10 tests in totals, but also claims +5 websocket tests; Story 6 final table then treats websocket file as only 6 tests total. This makes test-file and story-level math incoherent.  
Recommended fix: Decide whether Story 2b websocket tests are part of the counted plan or not, then align Story 2b docs, Story 6 final table, and totals.  
Effort: Medium  
Value: High

**Major**

3.  
ID: `COH-003`  
Severity: Major  
Title: Story 6 sequencing conflicts across dependency docs  
Evidence: `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2275`, `/Users/leemoore/code/liminal-builder/docs/stories/overview.md:25`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/story.md:16`  
Why it matters: One source says Story 6 depends only on Story 2b; others require Stories 0–5 complete. This creates execution-order ambiguity.  
Recommended fix: Publish one dependency rule (likely Story 6 after Story 5 for TC-5.6a/tab restore coupling) and update all dependency graphs/text.  
Effort: Low  
Value: High

4.  
ID: `COH-004`  
Severity: Major  
Title: `session:reconnect` contract has no clearly owned implementation story/file scope  
Evidence: `/Users/leemoore/code/liminal-builder/docs/feature-spec-mvp.md:608`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:534`, `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:531`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:25`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/story.md:54`  
Why it matters: The protocol requires `session:reconnect`, design maps it to `websocket.ts`, but Story 2b scope excludes it and Story 6 file scope also excludes `server/websocket.ts`. This is a missing dependency/ownership note.  
Recommended fix: Assign explicit ownership (Story 2b or Story 6) for `session:reconnect` server routing and add it to files/scope/verify checks.  
Effort: Medium  
Value: High

5.  
ID: `COH-005`  
Severity: Major  
Title: `verify`/`verify-all` contract drift vs `package.json`  
Evidence: `/Users/leemoore/code/liminal-builder/package.json:22`, `/Users/leemoore/code/liminal-builder/package.json:23`, `/Users/leemoore/code/liminal-builder/docs/stories/overview.md:65`, `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/story.md:19`, `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/story.md:20`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2042`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2043`  
Why it matters: Docs omit `lint:eslint` + `test:eslint-plugin` in `verify`, and some omit `test:client` from `verify-all`, so verification instructions are wrong.  
Recommended fix: Replace all script-contract text with exact `package.json` command chains.  
Effort: Low  
Value: High

6.  
ID: `COH-006`  
Severity: Major  
Title: Story 0 dependency baseline conflicts with actual `package.json`  
Evidence: `/Users/leemoore/code/liminal-builder/package.json:26`, `/Users/leemoore/code/liminal-builder/package.json:31`, `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/story.md:21`, `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/prompt-0.1-setup.md:100`, `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/prompt-0.1-setup.md:103`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2021`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md:2023`  
Why it matters: Docs state baseline includes `@fastify/sensible`, `zod`, `fastify-type-provider-zod`, but current package does not. This is a stale dependency contract.  
Recommended fix: Either add the dependencies to `package.json` or remove them from docs and note the design change explicitly.  
Effort: Medium  
Value: High

7.  
ID: `COH-007`  
Severity: Major  
Title: Story 3/4 running-total and phase baseline drift  
Evidence: `/Users/leemoore/code/liminal-builder/docs/stories/story-3-chat-ui/story.md:75`, `/Users/leemoore/code/liminal-builder/docs/stories/story-3-chat-ui/story.md:83`, `/Users/leemoore/code/liminal-builder/docs/stories/story-3-chat-ui/story.md:87`, `/Users/leemoore/code/liminal-builder/docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md:24`, `/Users/leemoore/code/liminal-builder/docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md:328`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/story.md:19`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md:27`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/prompt-4.2-green.md:23`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/prompt-4.R-verify.md:14`  
Why it matters: Story 3 is simultaneously 44 and 45; Story 4 prompts assume 44 prior while Story 4 story assumes 45 prior. This breaks red/green/verify coherence and cumulative gating.  
Recommended fix: Standardize Story 3 total and propagate into all Story 4 prompt prerequisites/checklists.  
Effort: Low  
Value: High

8.  
ID: `COH-008`  
Severity: Major  
Title: Story 5/6 running-total drift and self-contradiction  
Evidence: `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/story.md:79`, `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/story.md:92`, `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md:7`, `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md:522`, `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/prompt-5.R-verify.md:14`, `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/prompt-5.R-verify.md:124`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/story.md:16`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/story.md:97`  
Why it matters: Story 5 flips between 57/71 and 58/72; Story 6 flips between 72 and 71 prior. This corrupts final readiness math and execution checkpoints.  
Recommended fix: Normalize Story 5 prior=58 total=72 and Story 6 prior=72 across all story/prompt artifacts.  
Effort: Low  
Value: High

**Minor**

9.  
ID: `COH-009`  
Severity: Minor  
Title: WS `error` payload ambiguity (`cliType` appears in prompt flow but not in feature spec contract)  
Evidence: `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:58`, `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:250`, `/Users/leemoore/code/liminal-builder/docs/feature-spec-mvp.md:630`  
Why it matters: Prompt text suggests forwarding `{ cliType, message }` as WS `error`; feature spec contract is `{ type:'error', requestId?, message }`. This can create contract drift in tests/implementation.  
Recommended fix: Clarify internal-vs-on-wire error shape and require WS error payload normalization.  
Effort: Medium  
Value: Medium

10.  
ID: `COH-010`  
Severity: Minor  
Title: Story 2b AC labeling drift in overview (omits partial AC-5.2 coverage)  
Evidence: `/Users/leemoore/code/liminal-builder/docs/stories/overview.md:34`, `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/story.md:22`  
Why it matters: Traceability summaries disagree on whether Story 2b covers AC-5.2 partially, reducing AC-level audit clarity.  
Recommended fix: Add explicit “AC-5.2 (partial)” note in overview (or remove from Story 2b story if not intended).  
Effort: Low  
Value: Medium

---

### 3) Low-effort/value patch set

1. `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md`, `/Users/leemoore/code/liminal-builder/docs/stories/overview.md`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/story.md`  
One-line change summary: Align Story 6 dependency text/graph to one sequencing rule.

2. `/Users/leemoore/code/liminal-builder/docs/stories/overview.md`, `/Users/leemoore/code/liminal-builder/docs/stories/story-0-infrastructure/story.md`, `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md`  
One-line change summary: Replace stale `verify`/`verify-all` formulas with exact `package.json` script contracts.

3. `/Users/leemoore/code/liminal-builder/docs/stories/story-3-chat-ui/story.md`, `/Users/leemoore/code/liminal-builder/docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/prompt-4.2-green.md`, `/Users/leemoore/code/liminal-builder/docs/stories/story-4-session-management/prompt-4.R-verify.md`  
One-line change summary: Normalize Story 3 total/prior baselines to remove 44/45 and 27/28 contradictions.

4. `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/story.md`, `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md`, `/Users/leemoore/code/liminal-builder/docs/stories/story-5-tab-management/prompt-5.R-verify.md`, `/Users/leemoore/code/liminal-builder/docs/stories/story-6-codex-status-integration/story.md`  
One-line change summary: Normalize Story 5/6 prior and cumulative totals (58/72 baseline before Story 6).

5. `/Users/leemoore/code/liminal-builder/docs/stories/story-2b-agent-manager/prompt-2b.R-verify.md`  
One-line change summary: Replace stale “8/8 Story 2a” references with 9-test references.

6. `/Users/leemoore/code/liminal-builder/docs/stories/overview.md`  
One-line change summary: Add AC-5.2 partial note to Story 2b AC column (or explicitly mark intentional omission).

---

### 4) Medium/High-effort backlog

1. `COH-001` (Medium effort, High value)  
Tradeoff: Broad doc sweep across tech design sections may touch many downstream references, but restores single source of truth for gating.  
Suggested sequencing: Fix first, because all later story totals depend on it.

2. `COH-002` (Medium effort, High value)  
Tradeoff: Requires explicit decision on whether Story 2b websocket tests are counted in story totals/file totals; impacts final 79 reconciliation model.  
Suggested sequencing: Fix immediately after COH-001 so file-level and story-level counts remain consistent.

3. `COH-004` (Medium effort, High value)  
Tradeoff: Requires assigning implementation ownership across stories and potentially expanding prompt file scopes/checklists.  
Suggested sequencing: Fix before any Story 6 execution to avoid reconnect-path gaps.

4. `COH-006` (Medium effort, High value)  
Tradeoff: Either update runtime dependencies or de-scope docs; dependency decision affects implementation assumptions and security/validation patterns.  
Suggested sequencing: Resolve before Story 0/infra reruns and before validating package baseline.

5. `COH-009` (Medium effort, Medium value)  
Tradeoff: Contract clarification is small but may require test/prompt alignment if current tests assume extra fields.  
Suggested sequencing: Resolve after reconnect ownership, before final protocol verification pass.

---

### 5) Consistency matrix

| Story | Internally coherent? | Coherent with feature spec? | Coherent with tech design? | Coherent with overview/dependencies? | Notes |
|---|---|---|---|---|---|
| 0 | N | Y | Y | Y | Story docs use stale script/dependency contract vs package and prompt 0.1. |
| 1 | Y | Y | Y | Y | No material drift found. |
| 2a | Y | Y | N | Y | Tech design still states 8 tests / total 17. |
| 2b | N | Y | N | N | Test scope says 10 + 5 websocket while totals list 10; overview/final tables don’t reconcile. |
| 3 | N | Y | Y | N | 44 vs 45 total and 27 vs 28 prior baseline conflict. |
| 4 | N | Y | N | N | Story says 45 prior; all Story 4 prompts say 44 prior. |
| 5 | N | Y | N | N | 57/71 appears alongside 58/72 in same pack. |
| 6 | N | Y | N | N | 72-prior prerequisite conflicts with 71-prior cumulative row; dependency sequencing conflict. |

---

### 6) Final readiness statement
Execution should not proceed yet. The first fixes should be: unify the canonical test-count ladder (including Story 2b websocket test ownership), resolve Story 6 dependency/order and `session:reconnect` ownership, and align `verify`/`verify-all` plus Story 0 dependency baseline text to actual `package.json`. Once those are corrected, the remaining minor traceability wording issues can be cleaned up in a single final docs pass.