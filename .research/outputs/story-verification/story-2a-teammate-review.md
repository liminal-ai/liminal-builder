# Story 2a — Teammate Validation of Codex Report

## Codex Verdict: NOT READY
## Teammate Verdict: DISAGREE — **READY WITH ISSUES**

The Codex report identifies real concerns but overreacts to several of them, particularly around AC/TC traceability and the dependency graph. Several "Critical" and "Major" issues are design-by-intent rather than errors. The story is implementable with targeted fixes.

---

### Critical Issue 1: AC/TC traceability is broken — Story claims AC-5.1/5.3 partial coverage but those TCs map to agent-manager.test.ts

- **Codex claim:** Story 2a claims AC-5.1/5.3 coverage, but Flow 5 TCs (TC-5.1a, TC-5.1b, TC-5.3a) are mapped to `agent-manager.test.ts`, not `acp-client.test.ts`. Therefore traceability is broken.
- **Validated:** FALSE — this is a misunderstanding of "partial" coverage
- **Evidence:**
  - `story.md` lines 21-22: AC-5.1 is marked "Partial" with note "Agent process spawning protocol (initialize handshake)" and AC-5.3 is marked "Partial" with note "Process termination (close stdin, wait, SIGKILL)".
  - The story explicitly scopes its coverage to the **protocol-level** aspects of these ACs — initialize handshake (which is a prerequisite for spawning) and stdin close (which is how process termination begins).
  - The full AC-5.1 TCs (TC-5.1a "first session triggers agent launch", TC-5.1b "subsequent sessions reuse") are lifecycle behaviors that belong to Story 2b's AgentManager, as the tech design correctly maps them.
  - Story 2a's 8 tests don't claim to cover TC-5.1a/b or TC-5.3a. They cover protocol correctness: init, session/new, session/load, session/prompt, permission, error handling, close. These are protocol-layer prerequisites that enable the lifecycle TCs in Story 2b.
  - The tech design `docs/tech-design-mvp.md:2088` says: "ACs: AC-5.1 (partial — agent process spawning), AC-5.3 (partial — process termination)" — matching the story's claim.
  - `docs/tech-design-mvp.md:2094` describes Story 2a's tests as "Protocol correctness" — not lifecycle coverage.
- **Severity adjustment:** DOWNGRADE from Critical to **Not an Issue** — "Partial" coverage of an AC is a deliberate design decision. Story 2a covers the protocol-level prerequisites; Story 2b covers the lifecycle-level behaviors. The traceability chain is: Feature Spec AC-5.1 → implemented across Stories 2a (protocol) + 2b (lifecycle). This is correct story sharding.

---

### Critical Issue 2: Red test for graceful close has no real assertion

- **Codex claim:** The `close` test (test 8) has no real assertion — it just calls `close()` and checks it doesn't throw. This means AC-5.3 partial coverage can false-pass.
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - `prompt-2a.1-skeleton-red.md` lines 614-626: The test calls `client.close(100)` and has a comment saying "The specific assertion depends on mock implementation, but at minimum, close should not throw and should complete."
  - The test does NOT assert that stdin was closed, that pending requests were rejected, or any observable behavior.
  - However, the test does still serve a purpose: in the Red phase, this test will ERROR because `close()` throws `NotImplementedError`. In the Green phase, it will PASS only if `close()` completes without error. So it's not a no-op.
  - The `prompt-2a.R-verify.md` lines 109-110 include conceptual checks: "If `close()` is called with pending requests, those requests are rejected" and "`sessionCancel` sends a notification (no `id` field), not a request."
  - The Green prompt implementation (lines 377-389) shows `close()` closing stdin and rejecting pending requests — real behavior that goes beyond "not throwing."
- **Severity adjustment:** DOWNGRADE from Critical to **Major** — The test is weak but not completely useless. It validates that `close()` completes, which is non-trivial (must handle stdin close without error). However, it should assert observable behavior: at minimum, that `mock.stdin.close()` was called. Strengthening this test is warranted but doesn't make the story NOT READY.

---

### Major Issue 1: Dependency contradiction — graph says 2a runs parallel with Story 1, but prompts require Story 1 complete

- **Codex claim:** The dependency graph allows 2a to run in parallel with Story 1, but `story.md` line 14 says "Story 1 complete: 9 tests passing" as a prerequisite, and prompts reference "9 tests passing from Story 1."
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - `docs/stories/overview.md` lines 10-12: The dependency graph shows Story 1 and Story 2a both depending only on Story 0, with no dependency between them.
  - `story.md` line 14: "Story 1 complete: 9 tests passing" — explicit dependency.
  - `prompt-2a.1-skeleton-red.md` line 17: "9 tests passing from Story 1."
  - `prompt-2a.2-green.md` line 17: "9 tests passing from Story 1, 8 failing from Story 2a."
  - The "9 tests passing" reference is a **running total verification**, not a hard dependency. Story 2a doesn't use any Story 1 artifacts (ProjectStore, sidebar). It needs Story 0's type definitions and stubs.
  - The prompts mention Story 1's tests as context for "what tests should already be passing" when you run the full suite — useful for engineers to verify no regressions, not a blocking dependency.
- **Severity adjustment:** DOWNGRADE from Major to **Minor** — The reference to "Story 1 complete" in `story.md` prerequisites is misleading but doesn't represent a real code dependency. Story 2a's actual code dependencies are all Story 0 artifacts. The fix is simple: change "Story 1 complete" to "Story 0 complete" in story.md and note "If running in parallel with Story 1, the running total references adjust accordingly."

---

### Major Issue 2: Spawn ownership inconsistent across artifacts

- **Codex claim:** Feature spec mentions spawning in Story 2a description, but implementation prompts only target AcpClient over provided stdio.
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - Feature spec `docs/feature-spec-mvp.md:774`: "AcpClient class that can spawn an agent process, initialize it, create sessions..."
  - Tech design `docs/tech-design-mvp.md:2084`: "Stdio spawning and piping" listed in Story 2a scope.
  - But `prompt-2a.1-skeleton-red.md` and `prompt-2a.2-green.md` both construct AcpClient with `(stdin, stdout)` — no spawning. The constructor takes provided streams.
  - Story 2b is where `AgentManager` calls `Bun.spawn()` and passes stdin/stdout to AcpClient.
  - The tech design line 2084 says "Stdio spawning and piping" — this could mean "the stdio pattern" (framing, reading, writing) not "process spawning."
- **Severity adjustment:** DOWNGRADE from Major to **Minor** — The prompts are internally consistent: AcpClient receives streams, doesn't spawn processes. The feature spec's "can spawn" is high-level summary language, not a precise scope boundary. The tech design's "Stdio spawning and piping" is ambiguous. The actual implementation scope (protocol layer, no process management) is correct for the 2a/2b split. A documentation clarification would help.

---

### Major Issue 3: `sessionCancel` has no automated test

- **Codex claim:** `sessionCancel` is a required method but no test in the 8-test pack covers it.
- **Validated:** TRUE
- **Evidence:**
  - `story.md` line 9 lists `session/cancel` as a method AcpClient handles.
  - `story.md` line 73 lists "AcpClient can: ... cancel in-progress prompts" in exit criteria.
  - `prompt-2a.1-skeleton-red.md` lines 385-627: 8 tests listed — none test `sessionCancel`.
  - `prompt-2a.R-verify.md` line 110: "sessionCancel sends a notification (no id field), not a request" — listed as a conceptual/smoke check only.
  - The method is simple (one-liner: write a JSON-RPC notification), but it's still untested.
- **Severity adjustment:** KEEP as **Major** — A claimed feature with zero automated test coverage is a gap. The fix is simple: add a 9th test that verifies `sessionCancel` writes a notification (no `id` field) with the correct method and params. This would also require updating the test count from 8 to 9 across all docs.

---

### Major Issue 4: Prompt 2a.1 has contradictory constructor guidance

- **Codex claim:** The skeleton shows the constructor throwing `NotImplementedError` (line 173), but later instructions (line 638) say "the constructor should NOT throw."
- **Validated:** TRUE
- **Evidence:**
  - `prompt-2a.1-skeleton-red.md` line 173: The skeleton code has `throw new NotImplementedError('AcpClient.constructor');` in the constructor.
  - `prompt-2a.1-skeleton-red.md` lines 636-638: "The tests need to instantiate `AcpClient(mock.stdin, mock.stdout)` in `beforeEach`. If the constructor throws, every test fails before reaching the method under test. Therefore, the constructor should NOT throw."
  - The later instruction (lines 636-638) is clearly marked as "Important constructor note" and overrides the skeleton code.
  - `prompt-2a.1-skeleton-red.md` line 684: Done criteria says "server/acp/acp-client.ts has the class skeleton (constructor does NOT throw, methods throw NotImplementedError)."
- **Severity adjustment:** DOWNGRADE from Major to **Minor** — The contradiction exists in the code skeleton vs. the prose, but the prose explicitly calls out the override with a bolded "Important constructor note" and the Done criteria confirm the constructor must NOT throw. A competent engineer reads the full prompt and follows the explicit instruction. The skeleton should be fixed to not throw, but this is a documentation cleanup, not a blocker.

---

### Major Issue 5: Prompt 2a.2 says `close()` should wait for exit, but template doesn't wait

- **Codex claim:** The requirements say close should "wait up to timeoutMs for exit" (line 247) but the implementation template (line 377) just closes stdin and rejects pending requests without any wait.
- **Validated:** TRUE
- **Evidence:**
  - `prompt-2a.2-green.md` line 247-252: Requirements spec says: "1. Close stdin writer 2. Set a flag to stop the reading loop 3. Wait up to timeoutMs for the reading loop to complete."
  - `prompt-2a.2-green.md` lines 377-389: Implementation template has `close()` that closes stdin, sets `this.closed = true`, and rejects pending requests — but does NOT wait for the reading loop to complete. No `await`, no timeout, no Promise race.
  - The test (prompt-2a.1 line 614-626) also doesn't assert wait behavior.
  - This gap is between the spec within the prompt and the provided implementation code.
- **Severity adjustment:** KEEP as **Major** — The implementation template contradicts its own requirements section. However, for MVP, "close stdin and cleanup" is likely sufficient since the reading loop will naturally terminate when stdout closes. The timeout-based waiting is a nice-to-have. Still, the contradiction should be resolved.

---

### Minor Issue 1: Instruction precedence conflicts

- **Codex claim:** Prompt 2a.2 has conflicts about source of truth and file modification rules.
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - `prompt-2a.2-green.md` line 32: "No other files should be modified."
  - `prompt-2a.2-green.md` line 550: "Prefer not to modify tests; however, if a Red test has an invalid assumption or contract drift, make the smallest correction."
  - `prompt-2a.2-green.md` line 559: "If tests expect a different behavior than described here, the tests are the source of truth."
  - `prompt-2a.2-green.md` line 562: "Resolve routine inconsistencies using feature spec + tech design as source of truth."
  - Lines 559 and 562 do create tension: tests vs. spec/design as source of truth.
  - However, these are context-dependent: line 559 applies to implementation behavior, line 562 applies to architectural decisions. This is standard hierarchy: tests define expected behavior → spec defines intent → design defines structure.
- **Severity adjustment:** KEEP as **Minor** — The tension is real but manageable by an experienced engineer. Could benefit from a clearer priority statement.

---

### Minor Issue 2: Prompt 2a.1 conflict about modifying acp-types

- **Codex claim:** Prompt says "Do NOT modify server/acp/acp-types.ts" (line 645) but also "If acp-types is missing types, add them" (line 652).
- **Validated:** TRUE
- **Evidence:**
  - `prompt-2a.1-skeleton-red.md` line 645: "Do NOT modify `server/acp/acp-types.ts` -- use types as-is from Story 0."
  - `prompt-2a.1-skeleton-red.md` line 652: "If `server/acp/acp-types.ts` is missing types listed above, add them to that file and note the addition."
  - The "If Blocked" section (line 652) is an escape hatch for the constraint (line 645).
- **Severity adjustment:** KEEP as **Minor** — Standard constraint/escape-hatch pattern. The primary rule is "don't modify," the fallback is "if types are missing, add them." Not confusing to an engineer.

---

## Missed Issues

### Missed Issue 1: `tests/fixtures/acp-messages.ts` modification scope is unclear

- The prompt-2a.1 (line 32) says to **Update** `tests/fixtures/acp-messages.ts` with mock stdio helpers.
- Story 0 creates this file, but the prompt provides the full content (lines 239-380) as if creating it from scratch.
- If Story 0 already created this file with different content, the engineer might overwrite or conflict.
- The prompt does say "If the file already has content from Story 0, append to it -- do not remove existing exports" (line 634) which addresses this.
- **Severity:** Minor — addressed by instructions, but could be clearer about what Story 0 already put in the file.

### Missed Issue 2: No test for `canLoadSession` getter with `loadSession: false`

- The tests only verify `canLoadSession` returns `true` (test 1, line 446).
- There's no test for when the agent doesn't support `loadSession` (should return `false`).
- This is a simple getter with a `?? false` fallback, but it's a gap in test completeness.
- **Severity:** Minor

### Missed Issue 3: `sessionLoad` doesn't check `canLoadSession` before calling

- The `sessionLoad` method implementation (prompt-2a.2 lines 334-349) doesn't check `this.canLoadSession` before sending the request. If the agent doesn't support loading, the client will send the request anyway and get an error.
- Feature spec and tech design note session/load is optional (capability-dependent), but the guard is in Story 2b's AgentManager, not AcpClient.
- **Severity:** Minor — appropriate for the protocol layer to not have business logic guards; the calling layer handles it.

---

## Summary

The Codex report's analysis is thorough and it correctly identifies several real issues. However, its NOT READY verdict is too aggressive because:

1. **The Critical AC/TC traceability issue is wrong.** "Partial" coverage is a deliberate design choice in story sharding, not broken traceability. The Codex agent didn't understand the 2a/2b split design intent.

2. **The dependency issue is cosmetic.** Story 2a's actual code dependencies are all Story 0 artifacts. The "Story 1 complete" reference is a running total verification, not a real dependency.

3. **The spawn ownership issue is a documentation nuance**, not an implementation problem. The 2a/2b split correctly separates protocol from lifecycle.

4. **The constructor contradiction is resolved within the same prompt** by an explicit override note.

**Adjusted issue tally:**
- Critical: 0
- Major: 3 (weak close test, missing sessionCancel test, close() implementation contradicts requirements)
- Minor: 6 (dependency wording, spawn ownership docs, constructor skeleton, instruction precedence, acp-types constraint, fixture scope, canLoadSession coverage, sessionLoad guard)

**Final Readiness Verdict: READY WITH ISSUES** — The 3 Majors should be fixed before execution:
1. Add a 9th test for `sessionCancel` (update counts across all docs)
2. Strengthen the `close` test with an actual assertion
3. Align `close()` implementation template with its requirements (either simplify requirements or add wait logic)

The story is not "NOT READY" — it's a well-structured protocol story with some prompt polish needed.
