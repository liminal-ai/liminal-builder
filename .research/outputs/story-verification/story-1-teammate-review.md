# Story 1 — Teammate Validation of Codex Report

## Codex Verdict: READY WITH ISSUES
## Teammate Verdict: AGREE — READY WITH ISSUES

The Codex report is largely accurate. Most claims hold up under scrutiny with minor nuances. The story is implementable but would benefit from the fixes identified.

---

### Critical Issue 1: TC-1.3b is in Story 1 scope but not covered by Story 1 tests/prompts

- **Codex claim:** TC-1.3b ("Remove project with open tabs — associated tabs are closed") is listed in Story 1 scope per AC-1.3 in the feature spec, but Story 1 has no test for it.
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - Feature spec `docs/feature-spec-mvp.md:154-157` does list TC-1.3b under AC-1.3.
  - Story 1's `story.md` (lines 24-31) claims ACs 1.1-1.4 but the Test Breakdown (lines 52-70) only lists TC-1.3a, not TC-1.3b.
  - Tech design `docs/tech-design-mvp.md:2055-2056` says "TCs: TC-1.1a through TC-1.4b" which would include TC-1.3b.
  - However, tech design line 2062 explicitly lists only `TC-1.1a, TC-1.2a, TC-1.2b, TC-1.2d, TC-1.3a` for server tests, and line 2063 lists `TC-1.1b, TC-1.2c, TC-1.4a, TC-1.4b` for client tests. TC-1.3b is NOT in either list.
  - Tech design line 624 maps TC-1.3b to `Integration: websocket.test.ts` — this is an integration test, not a unit test, and the tech design's own test mapping table deliberately places it outside the 9-test Story 1 unit test scope.
  - The tech design line 1714 also maps TC-1.3b to the integration test table.
  - TC-1.3b requires tab management (Story 5), which doesn't exist yet in Story 1 scope.
- **Severity adjustment:** DOWNGRADE from Critical to **Minor** — TC-1.3b is intentionally deferred to integration testing. The tech design explicitly maps it to an integration test, not Story 1's unit tests. However, Story 1's story.md should note this deferral explicitly to avoid confusion. The statement "TCs: TC-1.1a through TC-1.4b" in the tech design overview (line 2056) is misleading since it implies all TCs in that range are covered.

---

### Major Issue 1: TC-1.3a "session mappings retained" is claimed but not actually tested

- **Codex claim:** TC-1.3a claims to test that session mappings are retained after project removal, but the actual test only verifies the project disappears from the list — it doesn't check session data.
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - `prompt-1.1-skeleton-red.md` lines 198-212 show the test for TC-1.3a. It:
    1. Adds a project, removes it, lists projects, asserts length is 0.
    2. Has a **comment** (lines 207-211) explaining: "Session mappings are in a separate file (sessions.json) managed by SessionManager. Removing a project from project-store does NOT touch session data. This is validated by the fact that project-store has no dependency on session-manager. The full 're-add and sessions reappear' flow is tested in Story 4."
  - The test IS correct for Story 1's scope — it tests that `removeProject` works (removes the project) and documents why session retention is inherently guaranteed (separate store, no coupling).
  - The feature spec TC-1.3a says "session-to-project mappings are retained" — this is satisfied architecturally (separate stores) and the full behavioral test is deferred to Story 4.
- **Severity adjustment:** DOWNGRADE from Major to **Minor** — The test is correctly scoped for Story 1. The "session mappings retained" property is an architectural guarantee tested by separation of concerns, not a behavioral test that needs to exist in Story 1. The comment in the test documents this intentionally. A stronger note in story.md about this deferral would help.

---

### Major Issue 2: `server/index.ts` wiring is inconsistent across story/prompt docs

- **Codex claim:** `server/index.ts` wiring is mentioned inconsistently — it's in the Verify prompt's modified files list but not in the Green prompt's "Files to Modify" list.
- **Validated:** TRUE
- **Evidence:**
  - `story.md` lines 42-49: "Modified Files" lists `project-store.ts`, `websocket.ts`, `sidebar.js`, `shell.css` — no `server/index.ts`.
  - `prompt-1.2-green.md` lines 108-114: "Files to Modify" lists 4 files — no `server/index.ts`.
  - `prompt-1.R-verify.md` line 18: "Files modified" explicitly includes `server/index.ts -- ProjectStore wiring`.
  - The Green prompt's websocket.ts section (lines 209-211) introduces `WebSocketDeps` pattern requiring ProjectStore injection, which implies `index.ts` must be modified to create and pass the ProjectStore. But `index.ts` is never listed as a file to modify.
- **Severity adjustment:** KEEP as **Major** — A fresh-context engineer following prompt-1.2 would implement `WebSocketDeps` but might not wire it into `index.ts` because it's not in the file list. This is a real gap that could cause a blocked engineer.

---

### Major Issue 3: Red prompt is internally inconsistent on path strategy for tests

- **Codex claim:** Red prompt tests use hardcoded paths like `/Users/test/code/project-alpha` that won't exist on the filesystem, but the implementation validates with `Bun.file(path).exists()`, so tests can't pass in Green without rework.
- **Validated:** TRUE
- **Evidence:**
  - `prompt-1.1-skeleton-red.md` line 116 says "Use real temp directories for valid-path cases" and creates a `tempDir` in `beforeEach`.
  - But the actual test code (lines 150-151) uses `/Users/test/code/project-alpha` — a hardcoded path, NOT the `tempDir`.
  - `prompt-1.2-green.md` lines 491-519 explicitly acknowledges this problem and provides instructions to fix the tests by using `join(tempDir, 'project-alpha')`.
  - The Green prompt (line 117) says "May Also Need to Modify" includes `tests/server/project-store.test.ts` with "Minor adjustments if test setup needs path mocking".
- **Severity adjustment:** DOWNGRADE from Major to **Minor** — The Green prompt explicitly anticipates and addresses this. The Red prompt's instructions (line 116) say to use real temp dirs, but the inline code contradicts this. However, the Green prompt's section 4 "Test Adjustments" (lines 487-519) provides the exact fix. A competent engineer following the prompts in sequence will handle this. Still worth aligning for cleanliness.

---

### Major Issue 4: Error contract is inconsistent between tech design and Story 1 prompt implementation guidance

- **Codex claim:** Tech design defines structured error codes (`PROJECT_PATH_INVALID`, `PROJECT_DUPLICATE`) but Story 1 prompts use simple `message`-only errors.
- **Validated:** TRUE
- **Evidence:**
  - Tech design `docs/tech-design-mvp.md:1949-1961`: Error Contract Additions table defines `PROJECT_PATH_INVALID`, `PROJECT_DUPLICATE` with specific user-facing messages.
  - `prompt-1.2-green.md` line 64: ServerMessage error type is `{ type: 'error'; requestId?: string; message: string }` — no `code` field.
  - `prompt-1.2-green.md` lines 129-130: ProjectStore uses `AppError('INVALID_PATH', ...)` and `AppError('DUPLICATE_PROJECT', ...)` — these error codes exist in the store layer.
  - `prompt-1.2-green.md` lines 265-266: WebSocket handler catches errors and sends `{ type: 'error', message: err.message }` — the error `code` from AppError is LOST.
  - Feature spec `docs/feature-spec-mvp.md` line 630: `{ type: 'error'; requestId?: string; message: string }` — also no `code` field in the WebSocket contract.
  - So the prompts are consistent with the feature spec (no code field), but the tech design adds an error code field that neither the feature spec nor the prompts implement.
- **Severity adjustment:** DOWNGRADE from Major to **Minor** — The tech design's "Error Contract Additions" section (line 1949) is explicitly labeled as an addition/enhancement. The feature spec's WebSocket contract is the source of truth, and Story 1 prompts correctly follow it. The error code can be added in a later story if needed. The internal `AppError` already carries codes, so the upgrade path is simple.

---

### Minor Issue 1: Constraint conflict in Red prompt (do not modify existing files vs Vitest config edits)

- **Codex claim:** Red prompt says "Do NOT modify any other existing files" but also says "if DOM globals not available, configure jsdom."
- **Validated:** TRUE
- **Evidence:**
  - `prompt-1.1-skeleton-red.md` line 362: "Do NOT modify any other existing files."
  - `prompt-1.1-skeleton-red.md` line 370: "If Vitest doesn't expose DOM globals, configure jsdom for the client test project and add a minimal setup polyfill only if needed."
  - These conflict if jsdom config requires modifying `vitest.config.ts` or similar.
- **Severity adjustment:** KEEP as **Minor** — This is a real contradiction but has a reasonable resolution: the "If Blocked" section is clearly an escape hatch. The constraint is primary, the escape hatch is secondary.

---

### Minor Issue 2: `removeProject` behavior for unknown ID is ambiguous

- **Codex claim:** Prompt says "throw or silently succeed — either is acceptable for MVP."
- **Validated:** TRUE
- **Evidence:**
  - `prompt-1.2-green.md` line 139: "If not found, throw `AppError('NOT_FOUND', 'Project not found')` (or silently succeed -- either is acceptable for MVP, but throwing is safer)."
  - The provided implementation code (lines 188-194) chooses to throw.
  - No test explicitly validates the unknown-ID case.
- **Severity adjustment:** KEEP as **Minor** — The prompt acknowledges the ambiguity and picks a default. The implementation template resolves it. Not a blocker.

---

## Missed Issues

### Missed Issue 1: `json-store.ts` listed as TDD Green deliverable in tech design but already implemented in Story 0
- Tech design line 2074 says "json-store.ts: Full implementation for Story 1 testing" under Story 1's TDD Green section.
- But Story 0 delivers `json-store.ts` as a "full implementation" per `story.md` line 14: "server/store/json-store.ts (full implementation)".
- `prompt-1.1-skeleton-red.md` line 16 also confirms it's already implemented.
- This is a tech design documentation inconsistency — it suggests Story 1 implements json-store when it's already done. Minor confusion risk.
- **Severity:** Minor

### Missed Issue 2: `shell.css` in modified files but no style guidance in prompts
- `story.md` line 49 lists `client/shell/shell.css` as modified.
- `prompt-1.2-green.md` line 113 says "Add project item and session list styles (if needed)."
- No CSS code is provided in any prompt. This is vague — the engineer must create styles from scratch without guidance.
- **Severity:** Minor

---

## Summary

The Codex report quality is **good** — it identified real issues across traceability, consistency, and completeness. However, several severity ratings were too aggressive:

- The Critical issue (TC-1.3b) is actually by-design deferral to integration testing — the tech design's test mapping table explicitly places it in integration scope. Downgraded to Minor.
- Two Major issues are addressed by the prompts themselves (path strategy is fixed in Green prompt; error contract follows feature spec not tech design additions).

**Adjusted issue tally:**
- Critical: 0
- Major: 1 (server/index.ts wiring gap)
- Minor: 7 (TC-1.3b documentation, TC-1.3a documentation, path strategy, error contract, Vitest config constraint, removeProject ambiguity, json-store duplication, CSS guidance)

**Final Readiness Verdict: READY WITH ISSUES** — The one Major (index.ts wiring omission in Green prompt) should be fixed before execution. The Minors are documentation improvements that would help but aren't blockers.
