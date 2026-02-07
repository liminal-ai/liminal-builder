# Story 3 — Teammate Validation of Codex Report

## Codex Verdict: NOT READY
## Teammate Verdict: AGREE — NOT READY (accurate assessment, most claims validated)

---

### Critical Issue 1: AC-3.1 behavior conflict (optimistic user turn vs server-confirmed user turn)

- **Codex claim:** Spec requires optimistic local render (feature-spec:662, feature-spec:292), but prompts/design tie user turn to `session:update` from server (prompt-3.2:126, tech-design:816).
- **Validated:** TRUE
- **Evidence:**
  - Feature spec line 662: `Client displays the user message optimistically as a user turn (no server acknowledgment needed)` — confirmed, explicitly says "optimistically" and "no server acknowledgment needed."
  - Feature spec line 292-295: TC-3.1a: `When: User types a message and sends it / Then: The message appears immediately in the chat as a user turn` — confirmed, "immediately" implies optimistic.
  - Tech design line 816: `S->>Sh: WS: session:update { entry: userMessage }` with note `server confirms user message` — confirmed, the sequence diagram shows the server sending the user message back as a `session:update`.
  - Prompt 3.2 line 126: `session:update: Upsert by entryId ... When the entry is type 'user', this represents the user's sent message appearing in chat (TC-3.1a)` — confirmed, the prompt ties TC-3.1a to server-side `session:update`, NOT to optimistic local rendering.
  - The conflict is real: the feature spec says "optimistically, no server acknowledgment needed" but the implementation design relies on a server `session:update` to render the user message. Under latency, the user's message would NOT appear "immediately" — it would wait for the WS round-trip.
  - However, the `sendMessage` function in prompt 3.2 line 140-142 does call `input.disable()` and `input.showCancel()` immediately, but does NOT create a local user entry. The user turn only appears when `session:update` arrives from the server.
- **Severity adjustment:** Keep Critical — This is a genuine spec-to-implementation disconnect. The TC-3.1a test in portlet.test.ts (line 242 of prompt 3.1) says "sent message appears immediately" but the rendering is tied to the server round-trip, not local optimistic insertion. An implementer following the prompts literally would fail the spirit of AC-3.1.

---

### Major Issue 1: Prompt 3.2 contradictory completion criteria about server edits

- **Codex claim:** Prompt requires editing `server/websocket.ts` (prompt-3.2:107) but also says "No server files modified" (prompt-3.2:368).
- **Validated:** TRUE
- **Evidence:**
  - Prompt 3.2 line 107: `1. **server/websocket.ts** -- WebSocket bridge and stream fan-out:` — confirmed, listed as first file to modify.
  - Prompt 3.2 line 368: `- [ ] No server files modified` — confirmed, in the "Done When" checklist.
  - Also prompt 3.2 line 312: `No server files beyond server/websocket.ts` — this partially clarifies that websocket.ts IS in scope, but the Done When checklist contradicts.
  - Prompt 3.2 line 320: `Do NOT modify server files other than server/websocket.ts` — again clarifies websocket.ts is in scope.
  - The contradiction is between the "Files to Modify" section (websocket.ts included) and the "Done When" checklist (line 368 says no server files modified). The middle of the document is clear but the final checklist contradicts.
- **Severity adjustment:** Keep Major — A fresh-context engineer reading the Done When checklist last would be confused. The task body and constraints sections make it clear websocket.ts is in scope, but the checklist creates ambiguity.

### Major Issue 2: Prompt 3.1 conflicting skeleton instructions

- **Codex claim:** Prompt says throw NotImplementedError (lines 196, 299) but also requires `sendMessage`/`cancelResponse` to post messages (lines 197, 198).
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - Prompt 3.1 line 196: `Each function body should throw new Error('NotImplementedError')` — confirmed, says ALL functions throw.
  - Prompt 3.1 line 197: `The sendMessage function should post { type: 'session:send', content } to parent` — confirmed, describes behavior.
  - Prompt 3.1 line 198: `The cancelResponse function should post { type: 'session:cancel' } to parent` — confirmed, describes behavior.
  - Prompt 3.1 line 299: `All functions in the client stubs should throw new Error('NotImplementedError')` — confirmed in Constraints section.
  - However, reading more carefully: line 196 says "each function body should throw" and lines 197-198 describe what the functions WILL DO (in green phase). The skeleton prompt is describing the function's purpose alongside the stub instruction. It's ambiguous but a careful reader would understand: stub now, implement later.
  - The TC-3.1a test (portlet.test.ts line 242) says "sent message appears immediately" — if `sendMessage` just throws, the test would error (which is correct for Red phase).
- **Severity adjustment:** Downgrade to Minor — The wording is clumsy but not truly contradictory. Lines 197-198 are describing intended behavior (for traceability), not skeleton requirements. The skeleton instruction is clear: throw. A careful reader would not be confused, but cleaner separation of "stub behavior" vs "intended behavior" would help.

### Major Issue 3: postMessage contract mismatch for `agent:status`

- **Codex claim:** Shell→Portlet type omits `cliType` (prompt-3.1:56) but TC example sends `cliType` in postMessage payload (prompt-3.1:243).
- **Validated:** TRUE
- **Evidence:**
  - Prompt 3.1 line 56: `| { type: 'agent:status'; status: 'starting' | 'connected' | 'disconnected' | 'reconnecting' }` — confirmed, NO `cliType` field.
  - Prompt 3.1 line 243: `TC-5.4a: launching indicator shown on agent starting -- send agent:status { cliType: 'codex', status: 'starting' } via postMessage` — confirmed, test sends `cliType` in the postMessage payload.
  - The contract translation table (prompt 3.1 line 93) says: `Shell preserves cliType for routing/logging and forwards UI-relevant status to portlet` — this implies the shell STRIPS cliType before forwarding to portlet.
  - But the TC-5.4a test description says to send `cliType` IN the postMessage to the portlet, which contradicts the type definition that omits it.
  - The test is inconsistent with the contract type. Either the type should include `cliType` or the test should not send it.
- **Severity adjustment:** Keep Major — The type definition and the test description disagree. An implementer writing the test would either add `cliType` (violating the type) or omit it (making the test not match the description). Must resolve.

### Major Issue 4: Verification does not directly validate required server Story 3 behavior

- **Codex claim:** Green requires websocket bridge changes (prompt-3.2:107) but verify focuses on client tests + grep inspection (prompt-3.R:35, 83).
- **Validated:** TRUE
- **Evidence:**
  - Prompt 3.2 line 107-119: Requires `server/websocket.ts` changes for `session:send`, `session:cancel`, streaming messages.
  - Prompt 3.R line 35-36: Runs `bun run test:client` — client tests only.
  - Prompt 3.R line 83: Uses `rg` grep inspection to check contract translations — not a runtime test.
  - Prompt 3.R line 27: `bun run verify` — this includes server tests, but only previously-existing ones from Stories 1/2a/2b. No new server test for Story 3's websocket changes.
  - The verify prompt never runs a server-side test that validates `session:send` → streaming → `session:complete` round-trip through the Story 3 WS bridge additions.
- **Severity adjustment:** Keep Major — Server-side Story 3 changes have no dedicated test coverage in the verify phase. The grep inspection is a heuristic, not a verification.

---

### Minor Issue 1: Test-style guidance inconsistency (`it` vs `test`)

- **Codex claim:** Prompt says "Use `it`" (line 250) but example uses `test(...)` (line 300).
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - Prompt 3.1 line 250: `Use the Vitest import convention: import { describe, it, expect, vi } from 'vitest' (use it not test, include vi for mocking)` — confirmed, says use `it`.
  - Prompt 3.1 line 300: `Tests must reference TC IDs in their test names (e.g., test('TC-3.2a: streaming renders incrementally', ...))` — confirmed, example uses `test()`.
  - However, in Vitest `it` and `test` are aliases — functionally identical. This is a style nit, not a functional issue.
- **Severity adjustment:** Keep Minor — Correct observation, trivial impact.

### Minor Issue 2: Dependency wording ambiguity ("temporary/mock session path" vs "real agent pipeline")

- **Codex claim:** Story uses "temporary/mock session routing" (story.md:9, prompt-3.2:9) but also mentions "real agent pipeline" (story.md:40).
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - Story.md line 9: `Story 3 uses temporary/mock session paths for send/cancel/stream handling so the chat flow can run end-to-end before full session lifecycle plumbing lands in Story 4` — confirmed.
  - Story.md line 40: `server/websocket.ts | Route session:send/session:cancel, stream back session:update/session:chunk/session:complete` — this is just describing what websocket.ts does, not claiming "real agent pipeline."
  - The Codex report references story.md:40 but I don't see "real agent pipeline" at that line. The actual text describes WS routing, which is consistent with the "temporary/mock" framing.
  - However, the feature spec's Story 3 summary (line 793) says: `Connected to real agent via Story 2b's pipeline` — this IS a "real pipeline" claim.
- **Severity adjustment:** Keep Minor — The ambiguity exists but is resolved by context: Story 3 connects to Story 2b's real pipeline for agent communication, but uses temporary session management (not yet Story 4's full lifecycle). The distinction is session CRUD vs message routing.

---

## Missed Issues

### Missed Issue 1: Prompt 3.1 line 338 vs story.md prerequisites mismatch (Minor)

- Prompt 3.1 line 338: `No server files modified` in the Done When checklist.
- Story.md line 40: `server/websocket.ts | Route session:send/session:cancel` — lists websocket.ts as a Story 3 modified file.
- Prompt 3.1 is the skeleton/red phase, which correctly should NOT touch server files. The "No server files modified" constraint is correct for Prompt 3.1 specifically. The Codex report only flagged this for Prompt 3.2 (where it IS contradictory), but didn't note that Prompt 3.1's constraint is actually correct — so the Codex was appropriately scoped.

### Missed Issue 2: Story 3 test count doesn't account for websocket bridge tests (Minor)

- Story.md claims 17 tests, all client-side (chat: 9, input: 5, portlet: 3).
- But Story 3 also modifies `server/websocket.ts` (new bridge behavior) with no server-side tests added.
- Tech design line 1710-1719 maps several WS bridge tests (session:create round-trip, session:send streams, cancel round-trip) to `tests/server/websocket.test.ts` — but Story 3 doesn't include these in its test count.
- Some of these WS tests may belong to Story 2b or Story 4, but the Story 3 bridge additions (session:send streaming, session:cancel) have no dedicated server tests.

### Missed Issue 3: `session:history` handling has no test coverage in Story 3 (Minor)

- The portlet message reconciliation handles `session:history` (replace entire entry list), but none of the 17 tests cover this case.
- TC coverage focuses on send/stream/complete/cancel flows but not the session:open → session:history → render flow.
- This may be intentionally deferred to Story 4 (session management), but it's a gap in Story 3's client test coverage since the portlet handler is implemented in Story 3.

---

## Summary

**Codex report quality: Good.** The critical AC-3.1 finding is the strongest catch — it identifies a genuine spec-to-implementation disconnect that could result in a latency-sensitive UX bug. All major findings were substantiated with accurate line references.

**Adjustments:**
- Major Issue 2 (skeleton conflicting instructions) downgraded to Minor — ambiguous wording but not truly contradictory in context.
- All other issues validated at their original severity.
- Found 3 additional missed issues (all Minor).

**Final issue count:**
- Critical: 1 (AC-3.1 optimistic vs server-confirmed user turn)
- Major: 3 (prompt 3.2 server file checklist contradiction, agent:status cliType contract mismatch, verify doesn't test server-side Story 3 behavior)
- Minor: 5 (skeleton wording, it vs test, dependency wording, session:history no test, WS bridge test gap)

**Final readiness verdict: NOT READY** — The Critical AC-3.1 optimistic rendering issue must be resolved (either update prompts to require optimistic insertion, or update spec to remove the "immediately" language). The Major prompt contradictions need cleanup before a fresh engineer can execute cleanly.
