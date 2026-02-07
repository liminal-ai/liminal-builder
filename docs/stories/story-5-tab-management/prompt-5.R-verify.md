# Prompt 5.R: Verify (Tab Management)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs (Claude Code, Codex). Stack: Bun + Fastify server, vanilla HTML/JS client (shell/portlet iframes), WebSocket bridge.

This is the VERIFY phase of Story 5 (Tab Management). The skeleton (5.1) and implementation (5.2) are complete. This prompt validates that everything is correctly wired, all tests pass, types check, and the implementation matches the spec.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `client/shell/tabs.js` -- fully implemented
- `tests/client/tabs.test.ts` -- 14 tests written and expected to pass
- All previous stories (0-4) complete with 57 passing tests

## Reference Documents
(For human traceability)
- Tech Design: `docs/tech-design-mvp.md` (Flow 4: Tab Management)
- Feature Spec: `docs/feature-spec-mvp.md` (ACs 4.1-4.7)

## Task

### Step 1: Run all tests

```bash
bun test
```

**Expected:** 71 tests PASS, zero failures.

Verify the breakdown:
- `tests/server/project-store.test.ts` -- 5 tests
- `tests/server/acp-client.test.ts` -- 8 tests
- `tests/server/agent-manager.test.ts` -- 10 tests
- `tests/server/session-manager.test.ts` -- 10 tests
- `tests/client/sidebar.test.ts` -- 7 tests (4 from Story 1 + 3 from Story 4)
- `tests/client/chat.test.ts` -- 9 tests
- `tests/client/input.test.ts` -- 5 tests
- `tests/client/portlet.test.ts` -- 3 tests
- `tests/client/tabs.test.ts` -- 14 tests (NEW)

Total: 71 tests

### Step 2: Run typecheck

```bash
bun run typecheck
```

**Expected:** zero errors.

### Step 3: AC-to-TC Traceability Check

Verify that the following acceptance criteria are covered by the specified test cases:

| AC | TC | Test Description | File |
|----|-----|------------------|------|
| AC-4.1 | TC-4.1a | New tab on session open | `tests/client/tabs.test.ts` |
| AC-4.1 | TC-4.1b | Multiple tabs | `tests/client/tabs.test.ts` |
| AC-4.2 | TC-4.2a | Scroll preserved on switch | `tests/client/tabs.test.ts` |
| AC-4.3 | TC-4.3a | Sidebar deduplicates | `tests/client/tabs.test.ts` |
| AC-4.3 | TC-4.3b | Tab count constant | `tests/client/tabs.test.ts` |
| AC-4.4 | TC-4.4a | Close removes tab and iframe | `tests/client/tabs.test.ts` |
| AC-4.4 | TC-4.4b | Close active switches to adjacent | `tests/client/tabs.test.ts` |
| AC-4.4 | TC-4.4c | Close last tab shows empty state | `tests/client/tabs.test.ts` |
| AC-4.5 | TC-4.5a | Tab shows title and CLI type | `tests/client/tabs.test.ts` |
| AC-4.5 | TC-4.5b | New session shows placeholder title | `tests/client/tabs.test.ts` |
| AC-4.6 | TC-4.6a | Drag reorder | `tests/client/tabs.test.ts` |
| AC-4.6 | TC-4.6b | Order persists | `tests/client/tabs.test.ts` |
| AC-4.7 | TC-4.7a | Tabs restore | `tests/client/tabs.test.ts` |

Additionally, cross-story test:
| AC-2.3 | TC-2.3b | Open already-tabbed session activates existing tab | `tests/client/tabs.test.ts` |

**Action:** Open `tests/client/tabs.test.ts` and verify each TC ID appears in a test description. If any are missing, report which ones.

### Step 4: Implementation Spot Checks

Verify these critical behaviors in `client/shell/tabs.js`:

1. **Iframe Map**: The module maintains a `Map<sessionId, iframe>` as the source of truth
2. **Deduplication**: `openTab()` checks `iframes.has(sessionId)` before creating a new iframe
3. **CSS toggle**: `activateTab()` sets `display: block` on the target iframe and `display: none` on all others
4. **Adjacent activation**: `closeTab()` activates the next tab in `tabOrder` (or previous if closing last)
5. **Empty state**: `closeTab()` shows the empty state when the last tab is closed
6. **localStorage key**: Persists under `liminal:tabs`
7. **localStorage format**: Contains `{ openTabs: string[], activeTab: string | null, tabOrder: string[] }`
8. **Restore on init**: `init()` calls `restoreTabState()` which reads from localStorage and recreates tabs
9. **Drag-and-drop**: Tab elements have `draggable="true"`, tab bar handles `dragover` and `drop`
10. **Tab element structure**: Each tab has `.tab-cli-indicator`, `.tab-title`, and `.tab-close` children

### Step 5: Manual Smoke Test (if server is running)

If the server is available:

1. Start server: `bun run dev`
2. Open browser: `http://localhost:3000`
3. Open a session -- verify tab appears
4. Open a second session -- verify second tab, first still present
5. Click first tab -- verify instant switch (no flicker, no delay)
6. Close second tab -- verify first tab becomes active
7. Close first tab -- verify empty state
8. Open two sessions, reorder tabs via drag -- verify order persists
9. Refresh browser -- verify tabs restore from localStorage

## Constraints

- Do NOT modify any source files during verification
- If tests fail, report the failures but do NOT fix them in this prompt
- If typecheck fails, report the errors but do NOT fix them in this prompt

## If Blocked or Uncertain

- If test count does not match 71, report the actual count and which tests are missing or extra
- If any TC IDs are missing from test descriptions, list them

## Verification

This IS the verification prompt. Success criteria:

1. `bun test` -- 71 tests, zero failures
2. `bun run typecheck` -- zero errors
3. All 14 TC IDs present in test descriptions
4. All 10 implementation spot checks confirmed

## Done When

- [ ] 71 tests PASS (57 previous + 14 new)
- [ ] `bun run typecheck` passes with zero errors
- [ ] All TC IDs verified in test descriptions (TC-4.1a, TC-4.1b, TC-4.2a, TC-4.3a, TC-4.3b, TC-4.4a, TC-4.4b, TC-4.4c, TC-4.5a, TC-4.5b, TC-4.6a, TC-4.6b, TC-4.7a, TC-2.3b)
- [ ] Implementation spot checks all confirmed
- [ ] Story 5 is COMPLETE -- ready for Story 6
