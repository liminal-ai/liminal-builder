# Handoff 02 — Story Verification Fixes

**Generated:** 2026-02-07
**Source:** Dual-validator verification pass — Codex GPT-5.3 (initial reports) + Claude Opus (teammate reviews) with structured debate resolution.
**Scope:** Stories 1, 2a, 2b, 3, 4, 5, 6 (Story 0 was not in verification scope)

## Total Fix Count: 48

| Story | Fixes |
|-------|-------|
| 1     | 8     |
| 2a    | 8     |
| 2b    | 8     |
| 3     | 9     |
| 4     | 6     |
| 5     | 9     |
| 6     | 10    |

---

## Story 1 — Project Sidebar

**Post-debate verdict:** READY WITH ISSUES (1 Major, 7 Minor)

### Fix 1.1 — `server/index.ts` missing from Green prompt file list (Major)

The Green prompt's `WebSocketDeps` pattern requires `ProjectStore` injection, which means `server/index.ts` must be modified to create and pass the `ProjectStore`. But `index.ts` is not listed in the "Files to Modify" section of `prompt-1.2-green.md`, even though the Verify prompt (`prompt-1.R-verify.md:18`) expects it.

- **Files:** `docs/stories/story-1-project-sidebar/prompt-1.2-green.md`, `docs/stories/story-1-project-sidebar/story.md`
- **Fix:** Add `server/index.ts` to the "Files to Modify" list in `prompt-1.2-green.md` (lines 108-114) with note: "Wire ProjectStore instance and pass as WebSocketDeps." Also add `server/index.ts` to `story.md` "Modified Files" (lines 42-49).

### Fix 1.2 — TC-1.3b deferral not documented in story.md (Minor)

TC-1.3b ("Remove project with open tabs — associated tabs are closed") is mapped to integration testing in the tech design (`tech-design-mvp.md:624`, `:1714`) but Story 1's `story.md` doesn't note this deferral. The tech design overview line 2056 says "TCs: TC-1.1a through TC-1.4b" which misleadingly implies full range coverage.

- **Files:** `docs/stories/story-1-project-sidebar/story.md`, `docs/tech-design-mvp.md`
- **Fix:** Add a "Deferred TCs" note to `story.md` test breakdown: "TC-1.3b is deferred to integration testing (requires tab management from Story 5). See tech-design-mvp.md:624." Update tech design line 2056 to list explicit TCs instead of range notation.

### Fix 1.3 — TC-1.3a test name overstates what is asserted (Minor)

The test for TC-1.3a claims to verify "session mappings retained" but only checks the project is removed from the list. The actual session retention is an architectural guarantee (separate stores) documented in a code comment, with full behavioral testing deferred to Story 4.

- **Files:** `docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md`
- **Fix:** Rename the test to clarify scope: e.g., "TC-1.3a: removeProject deletes project (session data untouched — verified by store separation, full re-add flow in Story 4)."

### Fix 1.4 — Red prompt path strategy inconsistency (Minor)

Red prompt line 116 says "Use real temp directories for valid-path cases" but the inline test code (line 150-151) uses hardcoded `/Users/test/code/project-alpha`. The Green prompt (lines 487-519) provides the fix, but the Red prompt should be internally consistent.

- **Files:** `docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md`
- **Fix:** Replace hardcoded paths in the Red prompt test code with `join(tempDir, 'project-alpha')` to match the Red prompt's own instruction at line 116. This eliminates the need for the Green prompt's "Test Adjustments" section.

### Fix 1.5 — Error contract cross-doc alignment debt (Minor)

Tech design "Error Contract Additions" (line 1949) introduces error codes (`PROJECT_PATH_INVALID`, `PROJECT_DUPLICATE`) that neither the feature spec (line 630) nor Story 1 prompts implement at the WebSocket level. The internal `AppError` carries codes, but they're stripped at the WS boundary.

- **Files:** `docs/tech-design-mvp.md`
- **Fix:** Add a note in the tech design's Error Contract Additions section clarifying these are internal error codes (used in `AppError`) that are NOT surfaced in the WebSocket `error` message type for MVP. The WS contract follows feature spec: `{ type: 'error', message: string }`.

### Fix 1.6 — Constraint conflict: "do not modify" vs Vitest config escape hatch (Minor)

Red prompt line 362 says "Do NOT modify any other existing files" but line 370 says "If Vitest doesn't expose DOM globals, configure jsdom." These conflict if jsdom requires modifying `vitest.config.ts`.

- **Files:** `docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md`
- **Fix:** Add parenthetical to line 362: "Do NOT modify any other existing files (exception: Vitest config if jsdom setup is required per the If Blocked section)."

### Fix 1.7 — `json-store.ts` listed as Story 1 Green deliverable in tech design but already done in Story 0 (Minor)

Tech design line 2074 says "json-store.ts: Full implementation for Story 1 testing" but Story 0 already delivers the full implementation.

- **Files:** `docs/tech-design-mvp.md`
- **Fix:** Change line 2074 to: "json-store.ts: Already implemented in Story 0 — used as dependency."

### Fix 1.8 — `shell.css` in modified files with no style guidance (Minor)

`story.md` line 49 lists `client/shell/shell.css` as modified but no prompt provides CSS code or specific styling guidance.

- **Files:** `docs/stories/story-1-project-sidebar/prompt-1.2-green.md`
- **Fix:** Add a brief CSS section to the Green prompt specifying minimal styles needed for `.project-item`, `.session-list`, and `.project-item.selected` classes. Even approximate styles are better than none.

---

## Story 2a — ACP Client

**Post-debate verdict:** READY WITH ISSUES (3 Major, 5 Minor)

### Fix 2a.1 — Missing `sessionCancel` test (Major)

`sessionCancel` is listed as a required method (`story.md:9`, exit criteria at `:73`) and is implemented in the Green prompt, but no automated test exists in the 8-test pack. Only the verify prompt mentions it as a conceptual check.

- **Files:** `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md`, `docs/stories/story-2a-acp-client/story.md`, `docs/stories/story-2a-acp-client/prompt-2a.R-verify.md`
- **Fix:** Add a 9th test: "TC: sessionCancel sends a JSON-RPC notification (no `id` field) with method `session/cancel`." Update test count from 8 to 9 in `story.md`, `prompt-2a.1`, `prompt-2a.2`, and `prompt-2a.R`.

### Fix 2a.2 — Weak `close()` test has no real assertion (Major)

The `close` test (test 8) calls `client.close(100)` and only verifies it doesn't throw. It doesn't assert that `stdin.close()` was called or that pending requests were rejected.

- **Files:** `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md`
- **Fix:** Strengthen the test to assert at minimum: `expect(mock.stdin.close).toHaveBeenCalled()`. For Red phase, this will fail (NotImplementedError), which is correct. In Green, it validates the core behavior.

### Fix 2a.3 — `close()` implementation template contradicts its own requirements (Major)

The requirements section (`prompt-2a.2-green.md:247-252`) specifies "Wait up to timeoutMs for the reading loop to complete." The implementation template (`prompt-2a.2-green.md:377-389`) closes stdin and rejects pending but does NOT implement wait logic.

- **Files:** `docs/stories/story-2a-acp-client/prompt-2a.2-green.md`
- **Fix:** Either (a) simplify the requirements to match the template: "Close stdin, set closed flag, reject pending requests" (acceptable for MVP since the reading loop terminates naturally when stdout closes), or (b) add `await Promise.race([readLoopComplete, timeout(timeoutMs)])` to the template. Option (a) is recommended for MVP simplicity.

### Fix 2a.4 — Dependency wording says "Story 1 complete" but Story 2a only needs Story 0 (Minor)

`story.md:14` says "Story 1 complete: 9 tests passing" but Story 2a has no code dependency on Story 1. The reference is a running-total verification, not a real dependency.

- **Files:** `docs/stories/story-2a-acp-client/story.md`, `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md`, `docs/stories/story-2a-acp-client/prompt-2a.2-green.md`
- **Fix:** Change prerequisite from "Story 1 complete" to "Story 0 complete (9 tests if Story 1 also done; 0 tests if running in parallel with Story 1)."

### Fix 2a.5 — Spawn ownership ambiguity in feature spec and tech design (Minor)

Feature spec line 774 says AcpClient "can spawn an agent process" and tech design line 2084 says "Stdio spawning and piping." But Story 2a's AcpClient receives stdin/stdout — spawning belongs to Story 2b's AgentManager.

- **Files:** `docs/tech-design-mvp.md`
- **Fix:** Clarify line 2084: change "Stdio spawning and piping" to "Stdio framing, reading, and writing (process spawning is Story 2b)."

### Fix 2a.6 — Constructor skeleton throws but must NOT throw (Minor)

`prompt-2a.1-skeleton-red.md:173` has the constructor throwing `NotImplementedError`, but lines 636-638 and the Done criteria (line 684) explicitly say the constructor must NOT throw. The contradiction is resolved within the prompt but the skeleton code should match.

- **Files:** `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md`
- **Fix:** Remove the `throw new NotImplementedError('AcpClient.constructor')` from the skeleton constructor code. Replace with parameter assignment (store stdin/stdout refs).

### Fix 2a.7 — Instruction precedence tension between tests-as-source-of-truth and spec-as-source-of-truth (Minor)

`prompt-2a.2-green.md:559` says "tests are the source of truth" while line 562 says "Resolve routine inconsistencies using feature spec + tech design as source of truth." These create tension.

- **Files:** `docs/stories/story-2a-acp-client/prompt-2a.2-green.md`
- **Fix:** Add a priority statement: "For implementation behavior (what the code does), tests are source of truth. For architectural decisions (how the code is structured), feature spec + tech design are source of truth."

### Fix 2a.8 — `acp-types.ts` constraint/escape-hatch wording (Minor)

`prompt-2a.1-skeleton-red.md:645` says "Do NOT modify acp-types.ts" while line 652 says "If acp-types is missing types, add them." The escape hatch pattern is correct but could be clearer.

- **Files:** `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md`
- **Fix:** Merge into one statement: "Use `acp-types.ts` as-is from Story 0. If any types listed in this prompt are missing, add them and note the addition."

---

## Story 2b — Agent Manager

**Post-debate verdict:** NOT READY (2 Critical, 3 Major, 3 Minor → must fix before execution)

### Fix 2b.1 — WebSocket contract contradiction: `error` vs `agent:error` (Critical)

Feature spec (line 630) and tech design (line 553) define WS error messages as `type: 'error'`. Story 2b prompts require forwarding as `agent:error` (`story.md:94`, `prompt-2b.2:243`). The prompt also says "keep existing WS payload contracts stable" while introducing `agent:error`.

- **Files:** `docs/stories/story-2b-agent-manager/story.md`, `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md`, `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md`, `docs/stories/story-2b-agent-manager/prompt-2b.R-verify.md`
- **Fix:** Normalize to `error` end-to-end to match the feature spec contract. Change all `agent:error` references in Story 2b docs to `error`. Update the `Keep existing WS payload contracts stable` constraint to be consistent.

### Fix 2b.2 — `Record<CliType, ...>` with only `claude-code` key fails TypeScript typecheck (Critical)

`CliType` is `'claude-code' | 'codex'` but `ACP_COMMANDS` uses `Record<CliType, ...>` with only the `claude-code` key. This is a type error: `Property 'codex' is missing ... but required in type 'Record<CliType, Cmd>'`. Prompts forbid adding codex config but require zero type errors.

- **Files:** `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md`, `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md`
- **Fix:** Change `Record<CliType, ...>` to `Partial<Record<CliType, ...>>` in both prompts. Add a runtime guard: `if (!ACP_COMMANDS[cliType]) throw new AppError('UNSUPPORTED_CLI', ...)`.

### Fix 2b.3 — WebSocket test scope under-specified (Major)

Story 2b's AgentManager tests (10 tests) are fully specified with complete test code. But the WS bridge tests (`story.md:71`, `prompt-2b.1:469-475`) are only described as 5 high-level bullets with no test count, mock setups, or assertions.

- **Files:** `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md`, `docs/stories/story-2b-agent-manager/story.md`
- **Fix:** Expand WS bridge tests to concrete, numbered test cases with expected payloads: (1) `session:create` routes to `ensureAgent` + `openSession`, (2) `session:send` routes to `sendPrompt`, (3) `session:cancel` routes to `cancelPrompt`, (4) `agent:status` forwarding on agent state change, (5) `error` forwarding on agent error. Include mock setups and assertions matching the AgentManager test quality.

### Fix 2b.4 — `reconnect` vs `manualReconnect` naming inconsistency (Major)

Tech design uses `manualReconnect` (lines 1070, 534) and `reconnect` (line 1448) in different sections. Prompts use `reconnect`. The WS routing table says `session:reconnect → agent-manager.manualReconnect(cliType)`.

- **Files:** `docs/tech-design-mvp.md`, `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md`, `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md`
- **Fix:** Normalize to `reconnect` everywhere. Update tech design lines 1070 and 534 to use `reconnect` instead of `manualReconnect`.

### Fix 2b.5 — `requestId` missing from Story 2b WS routing (Major)

Feature spec defines `requestId` as an optional field on all client messages (lines 596-601) for response correlation. Story 2b prompts never mention `requestId` in WS bridge routing or forwarding.

- **Files:** `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md`, `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md`, `docs/stories/story-2b-agent-manager/prompt-2b.R-verify.md`
- **Fix:** Add `requestId` pass-through in WS bridge routing: extract `requestId` from incoming messages, include it in response/error messages back to the client. Add at least one test asserting `requestId` correlation.

### Fix 2b.6 — Dependency wording says "Story 1 complete" but Story 2b only needs 0 + 2a (Minor)

Same issue as Story 2a. `story.md:14` and prompts reference "Story 1 complete" and "17 tests passing" which includes Story 1's tests, but Story 2b has no functional dependency on Story 1.

- **Files:** `docs/stories/story-2b-agent-manager/story.md`, `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md`, `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md`
- **Fix:** Change prerequisite to "Story 0 + Story 2a complete" and note test counts adjust based on whether Story 1 has also completed.

### Fix 2b.7 — AC-5.2 partial scope not in feature spec Story 2b summary (Minor)

Story 2b adds AC-5.2 partial coverage (`story.md:23`) but feature spec Story 2b ACs (line 787-789) only list 5.1/5.3/5.5.

- **Files:** `docs/stories/story-2b-agent-manager/story.md`
- **Fix:** Add a note: "AC-5.2 partial (state tracking only, UI indicators deferred to Story 6) — bonus scope beyond feature spec Story 2b summary."

### Fix 2b.8 — `AgentState` interface mismatch between Red and Green prompts (Minor)

Red prompt (`prompt-2b.1:84-89`) defines `AgentState` without `reconnectTimer`. Green prompt (`prompt-2b.2:80-86`) adds `reconnectTimer: ReturnType<typeof setTimeout> | null`. This is intended Red→Green evolution but not explicitly called out.

- **Files:** `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md`
- **Fix:** Add a note in the Green prompt: "Story 2b Green adds `reconnectTimer` to `AgentState` — this field is not in the Red skeleton and is added during Green implementation."

---

## Story 3 — Chat UI

**Post-debate verdict:** NOT READY (1 Critical, 3 Major, 5 Minor → must fix before execution)

### Fix 3.1 — AC-3.1 optimistic user turn vs server-confirmed user turn (Critical)

Feature spec (line 662) says "Client displays the user message optimistically as a user turn (no server acknowledgment needed)." TC-3.1a (line 292) says "appears immediately." But the prompts/design tie the user turn to `session:update` from the server (`prompt-3.2:126`, `tech-design:816`), meaning the user message waits for a WS round-trip.

- **Files:** `docs/stories/story-3-chat-ui/prompt-3.2-green.md`, `docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md`
- **Fix:** Update `sendMessage` in prompt-3.2 to optimistically insert the user message into the chat DOM immediately (before sending to server). Add a dedupe rule: when `session:update` arrives with the same user entry, update in place rather than duplicating. Update TC-3.1a test to assert immediate DOM insertion.

### Fix 3.2 — Prompt 3.2 "Done When" checklist contradicts server file edits (Major)

Prompt 3.2 lists `server/websocket.ts` as a file to modify (line 107) and constraints say "Do NOT modify server files other than server/websocket.ts" (line 320). But the "Done When" checklist (line 368) says "No server files modified."

- **Files:** `docs/stories/story-3-chat-ui/prompt-3.2-green.md`
- **Fix:** Change line 368 from "No server files modified" to "No server files modified except `server/websocket.ts`."

### Fix 3.3 — `agent:status` postMessage contract mismatch with `cliType` (Major)

The Shell→Portlet type definition (`prompt-3.1:56`) omits `cliType` from `agent:status`. But the TC-5.4a test description (`prompt-3.1:243`) sends `cliType` in the postMessage payload. The type and the test disagree.

- **Files:** `docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md`
- **Fix:** Either (a) add `cliType` to the `agent:status` Shell→Portlet type definition, or (b) remove `cliType` from the TC-5.4a test description. Since the shell strips cliType for routing (per line 93), option (b) is more consistent: update the test to send `{ type: 'agent:status', status: 'starting' }` without `cliType`.

### Fix 3.4 — Verify prompt has no server-side test for Story 3 WS bridge changes (Major)

Story 3 adds `session:send`, `session:cancel`, and streaming support to `server/websocket.ts`, but the verify prompt only runs client tests (`bun run test:client`) and uses grep inspection for server code. No runtime server test validates the Story 3 WS bridge additions.

- **Files:** `docs/stories/story-3-chat-ui/prompt-3.R-verify.md`
- **Fix:** Add at least a note acknowledging Story 3 server-side changes are verified through existing Story 2b WS tests (if true) or add a minimal server-side smoke test for `session:send` → streaming → `session:complete` round-trip.

### Fix 3.5 — Skeleton prompt conflicting function stub instructions (Minor)

`prompt-3.1:196` says "Each function body should throw NotImplementedError" while lines 197-198 describe what `sendMessage`/`cancelResponse` should do (post messages to parent). The intent is traceability documentation, not implementation instructions, but the wording is ambiguous.

- **Files:** `docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md`
- **Fix:** Separate stub behavior from intended behavior: "Each function body should throw `new Error('NotImplementedError')`. **Design intent (implemented in Green):** `sendMessage` posts `session:send` to parent; `cancelResponse` posts `session:cancel` to parent."

### Fix 3.6 — `it` vs `test` style inconsistency (Minor)

Prompt 3.1 line 250 says "Use `it` not `test`" but line 300 uses `test(...)` in the example.

- **Files:** `docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md`
- **Fix:** Change the example at line 300 from `test('TC-3.2a: ...')` to `it('TC-3.2a: ...')`.

### Fix 3.7 — Dependency wording ambiguity: "temporary/mock session" vs "real agent pipeline" (Minor)

`story.md:9` says "temporary/mock session paths" but the feature spec's Story 3 summary (line 793) says "Connected to real agent via Story 2b's pipeline." The distinction is that session CRUD is temporary (pre-Story 4) but agent message routing uses Story 2b's real pipeline.

- **Files:** `docs/stories/story-3-chat-ui/story.md`
- **Fix:** Clarify: "Story 3 uses Story 2b's real agent pipeline for message routing (send/stream/cancel) but uses temporary session management (full session CRUD lands in Story 4)."

### Fix 3.8 — `session:history` handler implemented but untested in Story 3 (Minor)

The portlet handler processes `session:history` (replace entire entry list) per `prompt-3.2:125`, but none of Story 3's 17 tests cover this code path. This is partially deferred to Story 4 but the portlet branch itself is unverified.

- **Files:** `docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md`
- **Fix:** Add a note: "The `session:history` portlet handler is implemented in Story 3 but tested in Story 4 (session management). Story 3 tests focus on send/stream/complete/cancel flows."

### Fix 3.9 — Story 3 server-side WS changes have no dedicated test count (Minor)

`story.md` claims 17 tests (all client-side: chat 9, input 5, portlet 3). But Story 3 also modifies `server/websocket.ts` with no server-side tests counted.

- **Files:** `docs/stories/story-3-chat-ui/story.md`
- **Fix:** Add a note to the test breakdown: "Server-side websocket.ts changes are covered by regression from Stories 2a/2b server tests. No new server tests added in Story 3."

---

## Story 4 — Session Management

**Post-debate verdict:** READY WITH ISSUES (2 Major, 4 Minor)

### Fix 4.1 — Tech design "join with ACP list" contradicts local-only listing (Major)

Tech design line 634 says "session lists come from combining local metadata with ACP agent data." Line 2191 says "Join algorithm: local mappings + ACP list." Both contradict line 638 ("listing is entirely local") and the feature spec (line 176).

- **Files:** `docs/tech-design-mvp.md`
- **Fix:** Update line 634 to: "Session lists are assembled entirely from local metadata (no ACP session/list method exists)." Remove or rewrite line 2191 to: "List algorithm: read local `sessions.json`, filter by project, return metadata array." Remove any "ACP list" join language.

### Fix 4.2 — Traceability gap: 3 TCs missing from Story 4 with no explicit deferral (Major)

Tech design line 2176 claims "TC-2.2a-f, TC-2.3a-b" for Story 4. But Story 4 only tests TC-2.2a, b, c, f (missing TC-2.2d, TC-2.2e) and TC-2.3a (missing TC-2.3b). TC-2.2d/e are manual/Gorilla; TC-2.3b is deferred to Story 5. No explicit deferral documentation exists in Story 4.

- **Files:** `docs/stories/story-4-session-management/story.md`, `docs/tech-design-mvp.md`, `docs/stories/story-4-session-management/prompt-4.R-verify.md`
- **Fix:** Add a "Deferred TCs" section to `story.md`: "TC-2.2d, TC-2.2e: Manual/Gorilla tests (deferred to Story 6 integration). TC-2.3b: Deferred to Story 5 (tab deduplication)." Update tech design line 2176 to list explicit TCs rather than ranges. Update verify prompt to say "each Story 4-owned TC" instead of "each TC."

### Fix 4.3 — Archive tab-close hedge in Green prompt (Minor)

Green prompt line 298 says "Close any associated tab (coordinate with tabs.js if available; if not wired yet, just remove from sidebar)." This hedges TC-2.4b. Since Story 4 executes before Story 5, tabs.js is a stub.

- **Files:** `docs/stories/story-4-session-management/prompt-4.2-green.md`
- **Fix:** Change to: "Close any associated tab by calling `closeTab(tabId)` (this is a no-op stub in Story 4's context; Story 5 implements the real behavior). Always call it for TC-2.4b traceability."

### Fix 4.4 — Red prompt verification command output expectations unclear (Minor)

The Red prompt runs full suites (`bun run test && bun run test:client`) which will include both passing old tests and failing new tests. The expected outcomes section doesn't explicitly describe this mixed result.

- **Files:** `docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md`
- **Fix:** Add: "Full suite will show ~44 passes (prior stories) and 13 failures/errors (new Story 4 tests). The separate `vitest run` commands below isolate the new tests to confirm they fail as expected."

### Fix 4.5 — Story 6 dependency narrative mismatch (Minor)

`overview.md:25` says Story 6 starts after Story 5. `tech-design-mvp.md:2275` says Story 6 depends on Story 2b. These are different claims about operational vs architectural dependency.

- **Files:** `docs/stories/overview.md`, `docs/tech-design-mvp.md`
- **Fix:** Reconcile: overview.md should say "Story 6 starts after Story 5 (operationally sequential)." Tech design should say "Story 6's code dependencies are Story 2b (agent manager) but executes after Story 5 per the sequential pipeline."

### Fix 4.6 — Prerequisite test counts ambiguously phrased (Minor)

`story.md:16` says "Story 2a complete (ACP client protocol layer, 17 tests pass)" — the 17 is the running total, not Story 2a's count (which is 8/9). Same for Story 2b (line 17: "27 tests pass" is the running total, not Story 2b's 10).

- **Files:** `docs/stories/story-4-session-management/story.md`
- **Fix:** Change to: "Story 2a complete (8 tests, running total: 17)" and "Story 2b complete (10 tests, running total: 27)."

---

## Story 5 — Tab Management

**Post-debate verdict:** READY WITH ISSUES (1 Critical, 0 Major, 8 Minor)

### Fix 5.1 — `initTabs` call-site incompatibility (Critical)

Story 0's `shell.js` calls `initTabs()` with no arguments. Story 5 redefines `init(tabBarEl, containerEl, emptyStateEl)` requiring 3 DOM element params and aliases `initTabs = init`. After Story 5, the `initTabs()` call in shell.js passes `undefined` for all three params, causing runtime failure. Story 5 constraints forbid modifying shell.js.

- **Files:** `docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md`, `docs/stories/story-5-tab-management/prompt-5.2-green.md`
- **Fix:** Either (a) make `init()` do DOM lookups via `document.getElementById()` when called with no args (recommended — maintains backward compat), or (b) add `client/shell/shell.js` to the allowed-modify list in Story 5 prompts and update the call to pass DOM elements. Option (a) is preferred: `function init(tabBarEl, containerEl, emptyStateEl) { tabBarEl = tabBarEl ?? document.getElementById('tab-bar'); ... }`.

### Fix 5.2 — `tabMeta` in localStorage contract inconsistency (Minor)

Tech design (line 1024) and skeleton JSDoc (`prompt-5.1:197`) describe localStorage as `{ openTabs, activeTab, tabOrder }` — no `tabMeta`. But tests (`prompt-5.1:457`) and Green implementation (`prompt-5.2:331`) include `tabMeta`. Green constraints (line 536) say "plus `tabMeta` for restore" parenthetically.

- **Files:** `docs/tech-design-mvp.md`, `docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md`, `docs/stories/story-5-tab-management/prompt-5.R-verify.md`
- **Fix:** Update tech design line 1024 to include `tabMeta`. Update skeleton JSDoc at `prompt-5.1:197` to include `tabMeta`. Update verify spot check at `prompt-5.R:82` to include `tabMeta`.

### Fix 5.3 — TC-4.2b (<100ms) excluded from automation but tech design mapping is inconsistent (Minor)

Story 5 correctly notes TC-4.2b is manual/performance (`story.md:31`). Tech design line 1033 agrees. But tech design lines 1760-1761 list TC-4.2b under `tests/client/tabs.test.ts`, contradicting the manual designation.

- **Files:** `docs/tech-design-mvp.md`
- **Fix:** Update tech design lines 1760-1761 to mark TC-4.2b as "Manual / Performance" instead of listing it under the test file. Same for TC-5.6a (mark as "Deferred to Story 6").

### Fix 5.4 — Tests call internal APIs instead of UI event paths (Minor)

Feature spec TCs describe user interactions (close button click, drag-and-drop), but tests directly call `closeTab()` and `reorderTabs()`. This is pragmatic for jsdom unit tests but the reasoning should be documented.

- **Files:** `docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md`
- **Fix:** Add a test strategy note: "Tests call public API functions directly rather than simulating DOM events. UI event wiring (click → closeTab, drop → reorderTabs) is verified via spot checks in the verify prompt and manual smoke testing."

### Fix 5.5 — Red prompt `it` import but `test` usage (Minor)

Import line (`prompt-5.1:240`) imports `it` from vitest, but tests use `test(...)` (`prompt-5.1:297`).

- **Files:** `docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md`
- **Fix:** Change import to include `test` or change test examples to use `it`. Be consistent.

### Fix 5.6 — Test scaffold variable scoping gap (Minor)

`beforeEach` stores `dom = createTabsDOM()` but doesn't destructure `{ tabBar, portletContainer, emptyState }`. Tests reference these variables without showing how they're obtained.

- **Files:** `docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md`
- **Fix:** Add destructuring after `createTabsDOM()` call: `const { tabBar, portletContainer, emptyState } = dom;` or show variables in a wider `describe` scope.

### Fix 5.7 — TC-5.6a deferred to Story 6 but verify smoke includes browser refresh restore (Minor)

`story.md:31` says "TC-5.6a is covered in Story 6." But `prompt-5.R:99` includes a manual smoke step: "Refresh browser — verify tabs restore from localStorage." This is the TC-5.6a behavior.

- **Files:** `docs/stories/story-5-tab-management/prompt-5.R-verify.md`
- **Fix:** Either (a) add a note: "Step 9 is an early smoke check of TC-5.6a behavior; formal coverage is in Story 6," or (b) remove step 9 from Story 5's verify and leave it entirely to Story 6.

### Fix 5.8 — TC-2.3b deferral from Story 4 undocumented (Minor)

TC-2.3b ("Open session that is already tabbed → activates existing tab") appears in Story 5 (`story.md:73`) as a cross-story test. But Story 4 never explicitly documents deferring it to Story 5.

- **Files:** `docs/stories/story-4-session-management/story.md`
- **Fix:** Add to Story 4's deferred TCs: "TC-2.3b: Deferred to Story 5 (requires tab deduplication logic)."

### Fix 5.9 — `tabMeta` parenthetically "optional" but effectively required for restore (Minor)

Green prompt constraint (`prompt-5.2:536`) says "plus `tabMeta` for restore" making it sound optional. But `restoreTabState()` reads `tabMeta` to reconstruct tabs with correct titles/cliTypes. Without it, restored tabs get fallback/wrong labels.

- **Files:** `docs/stories/story-5-tab-management/prompt-5.2-green.md`
- **Fix:** Change constraint from "(plus `tabMeta` for restore)" to include `tabMeta` as a required field: "localStorage format MUST include `{ openTabs, activeTab, tabOrder, tabMeta }`."

---

## Story 6 — Codex & Status Integration

**Post-debate verdict:** READY WITH ISSUES (0 Critical, 4 Major, 6 Minor)

### Fix 6.1 — AC-5.2 UI traceability gap: no client-side tests (Major)

Feature spec TC-5.2a-d are about UI-visible behaviors (status icon, disabled input, reconnect button). Story 2b tests cover server-side state transitions. Story 6 implements the UI (`portlet.js` status dot, `sidebar.js` reconnect button) but has no automated client tests for UI rendering. Verify prompt maps AC-5.2 only to server tests.

- **Files:** `docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md`, `docs/stories/story-6-codex-status-integration/story.md`, `docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md`
- **Fix:** Add client-side tests (or at minimum stub tests) for: (1) status dot renders correct class for each agent status, (2) input is disabled when agent is disconnected, (3) reconnect button appears in sidebar when agent is disconnected. Alternatively, explicitly document these as manual-only with justification.

### Fix 6.2 — `resyncState()` incomplete relative to design spec (Major)

Tech design (lines 240, 243) requires `project:list` + `session:list` + `session:open` on reconnect. The Green prompt's `resyncState()` (`prompt-6.2:153-164`) only sends `project:list`. The `session:list` and `session:open` calls are left as comments.

- **Files:** `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md`
- **Fix:** Either (a) add explicit `session:list` and `session:open` calls to `resyncState()`, or (b) document the delegation pattern: "After `project:list` response, the sidebar's existing render handler triggers `session:list` for expanded projects. `session:open` for active tabs is triggered by the tab restore flow." Include whichever is true.

### Fix 6.3 — Integration test setup has placeholders, not self-contained (Major)

`prompt-6.1:153` has `// ...` in `beforeAll`. `prompt-6.2:307` says "Import your server setup modules." `prompt-6.2:323` has `// ... register plugins, websocket handler, etc.` The mock ACP setup is entirely pseudocode comments.

- **Files:** `docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md`, `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md`
- **Fix:** Replace placeholders with concrete Fastify setup code: import app factory, register websocket plugin, inject mock AgentManager, create mock ACP process with stdin/stdout streams. Provide the complete `beforeAll`/`afterAll` setup.

### Fix 6.4 — TC-1.3b test name misrepresents coverage (Major)

The integration test is named "TC-1.3b: remove project sends project:removed" but TC-1.3b requires "remove project with open tabs → associated tabs are closed." The test only verifies the WS round-trip for `project:remove`, not tab closure.

- **Files:** `docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md`, `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md`, `docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md`
- **Fix:** Rename the test to "project:remove WebSocket round-trip" and remove the TC-1.3b label. TC-1.3b requires client-side tab+sidebar coordination testing, which this server test doesn't cover. Update traceability mapping in verify prompt accordingly.

### Fix 6.5 — Codex adapter stability documented as open question (Minor)

Tech design Q4 (line 2286) flags Codex adapter as an open question. Story 6 requires Codex integration. But the story's test design mocks ACP at the process boundary and real CLI validation is deferred to Gorilla testing.

- **Files:** `docs/stories/story-6-codex-status-integration/story.md`
- **Fix:** Add a note: "Codex adapter availability is a runtime concern, not a story readiness concern. All automated tests mock ACP. Real adapter validation is deferred to integration/Gorilla testing."

### Fix 6.6 — Codex path not exercised in automated tests (Minor)

All integration test snippets use `cliType: 'claude-code'`. TC-2.2e (Codex e2e) is deferred to manual Gorilla. The mock ACP layer is CLI-agnostic, so a Codex-path test would be low-value but the gap should be documented.

- **Files:** `docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md`
- **Fix:** Add a note: "TC-2.2e (Codex end-to-end) is validated via manual Gorilla testing. Automated tests use `cliType: 'claude-code'`; the Codex path differs only in `ACP_COMMANDS` binary lookup."

### Fix 6.7 — `liminal:tabs` tech design contract missing `tabMeta` (Minor)

Tech design line 264 defines `liminal:tabs` without `tabMeta`. Story 5 introduced `tabMeta` and Story 6 correctly inherits it.

- **Files:** `docs/tech-design-mvp.md`
- **Fix:** Update line 264 to include `tabMeta`: `liminal:tabs — { openTabs: string[], activeTab: string | null, tabOrder: string[], tabMeta: Record<string, { title: string, cliType: CliType }> }`. (Same fix as Fix 5.2 — tech design side.)

### Fix 6.8 — Dependency sequencing inconsistent across docs (Minor)

`overview.md:25` says Story 6 after Story 5. `tech-design-mvp.md:2275` says Story 6 depends on Story 2b. `story.md:16` says Stories 0-5 complete.

- **Files:** `docs/stories/story-6-codex-status-integration/story.md`
- **Fix:** Clarify in story.md: "Operational prerequisite: Stories 0-5 complete (sequential pipeline). Architectural dependency: Story 2b (agent manager)."

### Fix 6.9 — Stale line references in prompt (Minor)

`prompt-6.1:28` references "Story 6 breakdown, lines ~2086-2115" in the tech design. Actual location is ~line 2228.

- **Files:** `docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md`
- **Fix:** Update line reference to `~2228-2260`.

### Fix 6.10 — TC-2.2f dual ownership undocumented (Minor)

TC-2.2f appears in both `tests/server/session-manager.test.ts` (Story 4) and `tests/server/websocket.test.ts` (Story 6). This dual ownership is valid (unit + integration) but not explicitly acknowledged.

- **Files:** `docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md`
- **Fix:** Add a note: "TC-2.2f is tested at both unit level (session-manager, Story 4) and integration level (websocket round-trip, Story 6)."

---

## Cross-Story Issues (addressed via individual story fixes above)

These patterns recur across multiple stories and should be fixed consistently:

1. **Running-total test counts as prerequisites:** Stories 2a, 2b, 4 all reference "N tests passing" where N is the running total, not the story's own count. Fix in each story's prerequisites (Fixes 2a.4, 2b.6, 4.6).

2. **`liminal:tabs` localStorage contract missing `tabMeta`:** Tech design line 264 and 1024 both need updating. Affects Stories 5 and 6 (Fixes 5.2, 6.7).

3. **Story 6 dependency narrative:** `overview.md` vs `tech-design-mvp.md` conflict. Affects Stories 4 and 6 planning (Fixes 4.5, 6.8).

4. **`it` vs `test` style inconsistency:** Affects Stories 3 and 5 (Fixes 3.6, 5.5).

5. **`reconnect` vs `manualReconnect`:** Tech design internal naming conflict (Fix 2b.4).
