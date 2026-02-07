# Story 6 — Teammate Validation of Codex Report

## Codex Verdict: NOT READY
## Teammate Verdict: DISAGREE — should be READY WITH ISSUES

The Codex report identified real issues but overstated severity on several, and the Critical issue is based on a misunderstanding of the tech design's intent. Story 6 is implementable with the issues flagged below addressed during execution.

---

### Critical Issue 1: Core external dependency unresolved (Codex adapter)

- **Codex claim:** `docs/tech-design-mvp.md:2286` shows Codex adapter stability is an open question with fallback to skipping Codex, making Story 6's primary goal unresolvable.
- **Validated:** PARTIALLY TRUE
- **Evidence:** Tech design Q4 at line 2286 reads: "May need to build from source. Fallback: implement only Claude Code for MVP, add Codex when adapter is validated." This is an acknowledged open question, not a blocker. Story 6's Codex scope is minimal — it adds a single `ACP_COMMANDS` entry (`prompt-6.2-green.md:57-66`). The adapter availability is a runtime/installation concern, not a story readiness concern. The command config can be written regardless of whether the adapter binary is installed. All automated tests mock ACP at the process boundary, so they don't need the real binary either.
- **Severity adjustment:** DOWNGRADE from Critical to Minor — The Codex command config is trivially addable. The open question is about runtime validation (Gorilla testing items 13-15), which the verify prompt already marks as deferred to "integration testing with real adapters" (`prompt-6.R-verify.md:220`). This is a known, documented trade-off, not a story blocker.

---

### Major Issue 1: AC-5.2 UI traceability weak/incomplete

- **Codex claim:** Feature spec defines UI-visible behaviors for AC-5.2 (status icon, disabled input, reconnect button) but Story 6 has no portlet/sidebar UI tests; claims TC-5.2a-d are covered by Story 2b.
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - Story 2b's `story.md:23` explicitly says AC-5.2 is "Partial — Agent lifecycle state tracking (connected/disconnected/reconnecting); UI indicators in Story 6."
  - Story 2b covers TC-5.2a-d in `tests/server/agent-manager.test.ts` — these test the **server-side** state machine transitions, not the UI.
  - Story 6 implements the UI (`portlet.js` status dot, `sidebar.js` reconnect button) in `prompt-6.2-green.md:182-283` but has **no automated client tests** for the UI rendering of these indicators.
  - The verify prompt (`prompt-6.R-verify.md:153-156`) maps AC-5.2 / TC-5.2a-d only to `tests/server/agent-manager.test.ts`, confirming there's no client UI test.
  - However, the feature spec's TC-5.2a-d are about **what the user sees** (green dot, red dot, reconnect button), not server state transitions. There's a semantic gap: the server tests verify state tracking but not the UI rendering.
- **Severity adjustment:** KEEP as Major — This is a real traceability gap. The UI behavior for AC-5.2 is untested at the client level. Manual verification items 14-15 in the verify prompt partially cover this, but there should be at least stub client tests asserting the DOM rendering.

---

### Major Issue 2: Codex path not exercised in automated tests

- **Codex claim:** All integration test snippets use `cliType: 'claude-code'` only; TC-2.2e (Codex e2e) deferred to manual Gorilla.
- **Validated:** TRUE
- **Evidence:**
  - `prompt-6.1-skeleton-red.md:200` — `session:create` uses `cliType: 'claude-code'`
  - `prompt-6.2-green.md:381` — Green prompt also uses `cliType: 'claude-code'`
  - `prompt-6.R-verify.md:97` — TC-2.2e mapped to "Manual/Gorilla"
  - Tech design line 2232-2233 lists TC-2.2e in Story 6's scope
  - No integration test creates a `cliType: 'codex'` session
- **Severity adjustment:** DOWNGRADE to Minor — The mock ACP layer is CLI-agnostic (it mocks at the process spawn boundary). The only difference between Claude Code and Codex paths in the agent manager is the `ACP_COMMANDS` entry (different binary name). Adding a Codex-path integration test would be trivial but low value since the protocol is identical. The manual Gorilla deferral is reasonable given the adapter stability question.

---

### Major Issue 3: TC-1.3b misrepresented in integration test coverage

- **Codex claim:** Feature spec TC-1.3b requires "remove project with open tabs" and associated tabs closed, but Story 6's integration test only asserts `project:removed`.
- **Validated:** TRUE
- **Evidence:**
  - Feature spec line 154-157: TC-1.3b = "Given: A project has sessions open in tabs; When: User removes the project; Then: Associated tabs are closed, project disappears from sidebar."
  - `prompt-6.1-skeleton-red.md:256-270`: Test name is "TC-1.3b: remove project sends project:removed" — only asserts `response.type === 'project:removed'` and `response.projectId`.
  - The test doesn't set up any open tabs, doesn't verify tab closure, and runs on the server side (WebSocket integration), not client side.
  - The test verifies the **server round-trip** for project removal, not the **client behavior** of closing tabs.
- **Severity adjustment:** DOWNGRADE to Minor — The test name misleadingly references TC-1.3b, but the test is actually verifying `project:remove` WebSocket round-trip (a generic integration test). The tab-closure behavior of TC-1.3b requires client-side testing (sidebar + tabs coordination). The test should be renamed to remove the TC-1.3b label, or the scope clarified. The actual TC-1.3b client behavior would need testing in Story 1 or Story 5 client tests.

---

### Major Issue 4: `liminal:tabs` contract mismatch

- **Codex claim:** Tech design defines `liminal:tabs` as `{ openTabs, activeTab, tabOrder }` (line 264), but Story 6 prompts add undocumented `tabMeta` field.
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - Tech design line 264: `liminal:tabs — { openTabs: string[], activeTab: string | null, tabOrder: string[] }` — no `tabMeta`.
  - BUT: Story 5's prompts (`prompt-5.2-green.md:318-331`) introduce `tabMeta` as part of the localStorage save/restore implementation. Story 5's prompt explicitly says: "localStorage format MUST include `{ openTabs, activeTab, tabOrder }` (plus `tabMeta` for restore)" (line 536).
  - Story 5's Red prompt (`prompt-5.1-skeleton-red.md:457`) also uses `tabMeta` in test fixtures.
  - So `tabMeta` is a **Story 5 implementation detail** that Story 6 correctly inherits. The mismatch is between the tech design doc (not updated after Story 5 prompt drafting) and the actual implementation contract.
- **Severity adjustment:** DOWNGRADE to Minor — The inconsistency is real but it's a tech design doc staleness issue, not a Story 6 prompt error. Story 6's use of `tabMeta` is consistent with Story 5's implementation. The tech design's localStorage contract should be updated to include `tabMeta`, but this doesn't block Story 6 execution.

---

### Major Issue 5: Reconnect/resync behavior incompletely specified

- **Codex claim:** Design requires `project:list` + `session:list` + `session:open` on reconnect, but prompt code only explicitly sends `project:list`.
- **Validated:** TRUE
- **Evidence:**
  - Tech design line 240: "On reconnect success: re-send `project:list` and `session:list` for expanded projects to resync state"
  - Tech design line 243: "The browser re-fetches tab state from local storage...and re-opens sessions via `session:open` for each tab."
  - `prompt-6.2-green.md:153-164` (`resyncState()`): Only sends `wsSend({ type: 'project:list' })`. Then has comments about sidebar requesting session lists but no implementation. No `session:open` calls.
  - The comment at line 162-163 says "project IDs are needed -- the sidebar will request session lists as project:list response arrives and sidebar renders" — this is an implicit delegation to the sidebar's existing render logic, not an explicit implementation gap.
- **Severity adjustment:** KEEP as Major — The `resyncState()` function as written is incomplete relative to the design spec. However, there's a reasonable interpretation: the sidebar's existing `project:list` response handler may already trigger `session:list` requests for expanded projects. But `session:open` for each tab is explicitly called out in the design and not implemented. A fresh-context engineer would find this ambiguous.

---

### Major Issue 6: Prompts not fully self-contained

- **Codex claim:** Integration test setup has placeholders (`...`, "import your server setup modules") instead of concrete code.
- **Validated:** TRUE
- **Evidence:**
  - `prompt-6.1-skeleton-red.md:153`: `beforeAll` body has `// ...` placeholder
  - `prompt-6.2-green.md:307`: `// Import your server setup modules` — not a concrete import
  - `prompt-6.2-green.md:323`: `// ... register plugins, websocket handler, etc.` and `// ... inject mock agent manager`
  - The mock ACP setup at `prompt-6.1-skeleton-red.md:125-135` is entirely pseudocode comments, not actual implementation
- **Severity adjustment:** KEEP as Major — This is a legitimate self-containedness violation per the liminal-spec methodology. The prompt references say "Key content IN the prompt" and "Don't require model to go read another doc." The integration test setup requires the engineer to figure out Fastify plugin registration, WebSocket handler wiring, and mock ACP process creation from scratch. A fresh-context engineer would struggle with these placeholders.

---

### Minor Issue 1: Dependency sequencing inconsistent

- **Codex claim:** Overview says after Story 5, tech design says after Story 2b, story.md says Stories 0-5 complete.
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - `docs/stories/overview.md:25`: "Story 6 starts only after Story 5 (Stories 0-5 complete)."
  - `docs/tech-design-mvp.md:2272-2275`: Dependency graph shows Story 6 branching from Story 2b, not from Story 5. Line 2275 confirms: "Story 6 depends on Story 2b (agent manager must exist)."
  - `story.md:16`: "Stories 0-5 complete: 71 tests passing"
  - The overview and story.md say Stories 0-5 (sequential prerequisite). The tech design says Story 2b (minimal dependency). These are different claims about what's *required* vs what's *expected*.
- **Severity adjustment:** KEEP as Minor — The overview's claim that Story 6 requires Stories 0-5 is the operational truth (since stories execute sequentially 3→4→5→6). The tech design's minimal dependency (Story 2b) is the architectural truth (what Story 6 actually *uses*). Both are valid perspectives, but they should be reconciled. Not a blocker.

---

### Minor Issue 2: Reference line pointers stale

- **Codex claim:** Prompt cites tech design Story 6 at `~2086-2115`, actual location is `~2228`.
- **Validated:** TRUE
- **Evidence:**
  - `prompt-6.1-skeleton-red.md:28`: References "Story 6 breakdown, lines ~2086-2115"
  - Actual Story 6 section in tech design starts at line 2228
  - The `~` prefix acknowledges these are approximate, but the offset is ~140 lines off
- **Severity adjustment:** KEEP as Minor — Stale line references are a documentation maintenance issue. Since prompt methodology says "Reference files are for human traceability. The model executes from what's inlined," this doesn't affect execution. Still worth fixing.

---

## Missed Issues

### Missed Issue 1: Backoff parameters inconsistent between design and prompts (Minor)

- Tech design line 237-239 specifies WS reconnection: "500ms, 1s, 2s, 4s, cap 5s"
- Feature spec AC-5.6 doesn't specify exact values
- `prompt-6.2-green.md:90-91`: Uses `WS_RECONNECT_BASE_MS = 500` and `WS_RECONNECT_MAX_MS = 5000` — matches design
- `prompt-6.2-green.md:135`: Comment says "Exponential backoff: 500ms, 1s, 2s, 4s, cap 5s" — matches
- BUT the tech design (for server-side agent reconnect) at `story-2b:7` specifies "1s, 2s, 4s, 8s, 16s, cap 30s; 5 auto-retries" — these are **different** parameters for agent vs WebSocket reconnection
- The prompt correctly distinguishes these but doesn't explicitly call out that WS reconnect has NO retry limit while agent reconnect has 5 retries. This is documented but could confuse implementers.

### Missed Issue 2: TC-2.2f tested in both session-manager and websocket integration (Minor)

- `prompt-6.R-verify.md:38-39`: TC-2.2f appears in `tests/server/session-manager.test.ts` (Story 4) AND `tests/server/websocket.test.ts` (Story 6)
- `prompt-6.R-verify.md:98`: TC-2.2f mapped to `tests/server/websocket.test.ts`
- This is dual ownership — TC-2.2f is tested at both the unit level (session manager) and integration level (WebSocket round-trip). Not inherently wrong, but the story should acknowledge this explicitly.

### Missed Issue 3: `tabs.test.ts` count discrepancy (Minor)

- `prompt-6.R-verify.md:44`: Lists `tests/client/tabs.test.ts` as having **15** tests (Stories 5+6: TC-4.1a-b through TC-4.7a plus TC-2.3b and TC-5.6a)
- Story 5 overview says 14 tests for tabs
- Story 6 adds 1 = 15 total
- But the tab test count (14 from Story 5 + 1 from Story 6 = 15) differs from the 14 listed in the tech design (`docs/tech-design-mvp.md:2212`). The extra test is TC-2.3b which appears in the verify prompt but isn't in the Story 5 tech design section. This needs confirmation that TC-2.3b was correctly allocated.

---

## Summary

**Codex report quality:** Good but overly conservative. The Codex agent correctly identified real issues but inflated severity on several, leading to a NOT READY verdict that isn't warranted.

**Specific quality notes:**
- Line references were largely accurate (verified against actual files)
- The Critical issue (Codex adapter dependency) misreads a documented fallback as a blocking concern
- Major Issues 2, 3, and 4 are real but are Minor in practice
- Major Issues 1, 5, and 6 are correctly identified and correctly categorized
- The Codex agent missed the nuance that `tabMeta` was introduced by Story 5's prompts, not invented by Story 6

**Final readiness verdict: READY WITH ISSUES**

Issues to fix before execution:
1. **(Major)** Add AC-5.2 client UI test coverage or explicitly document it as manual-only
2. **(Major)** Complete `resyncState()` implementation guidance — explicitly handle `session:list` and `session:open` per design
3. **(Major)** Make integration test setup self-contained — replace placeholders with concrete Fastify + mock ACP setup code
4. **(Minor)** Fix TC-1.3b test name — rename to generic "project:remove round-trip" or add actual tab-closure assertions
5. **(Minor)** Update tech design `liminal:tabs` contract to include `tabMeta` (doc staleness)
6. **(Minor)** Update stale line references in prompt-6.1
