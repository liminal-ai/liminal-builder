# Prompt 3.R: Verify (Chat Session UI)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. The stack is Bun + Fastify server, vanilla HTML/JS client using a shell/portlet (iframe) model, with WebSocket bridging the browser to ACP agent processes (Claude Code, Codex) running over JSON-RPC/stdio.

Story 3 implemented the chat interface inside the portlet iframe: message rendering, streaming responses, markdown, auto-scroll, tool calls, thinking blocks, and cancel. This verification phase confirms everything works correctly, with no regressions.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- Story 3 Green phase complete (portlet.js, chat.js, input.js, markdown.js implemented)
- 17 new tests written across 3 test files
- 27 prior tests from Stories 0-2b

## Reference Documents

(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Flow 3: Chat Interaction)
- Feature Spec: `docs/feature-spec-mvp.md` (ACs 3.1-3.7, AC-5.4)

## Task

### 1. Run All Tests

```bash
bun test
```

**Expected:** 44 tests pass, 0 fail.

Breakdown:
- `tests/server/project-store.test.ts`: 5 tests (Story 1)
- `tests/client/sidebar.test.ts`: 4 tests (Story 1)
- `tests/server/acp-client.test.ts`: 8 tests (Story 2a)
- `tests/server/agent-manager.test.ts`: 10 tests (Story 2b)
- `tests/client/chat.test.ts`: 9 tests (Story 3) -- NEW
- `tests/client/input.test.ts`: 5 tests (Story 3) -- NEW
- `tests/client/portlet.test.ts`: 3 tests (Story 3) -- NEW

### 2. Run Typecheck

```bash
bun run typecheck
```

**Expected:** 0 errors.

### 3. Verify No Regressions

Run the prior story tests in isolation to confirm nothing broke:

```bash
# Story 1 tests
bun test tests/server/project-store.test.ts tests/client/sidebar.test.ts

# Story 2a tests
bun test tests/server/acp-client.test.ts

# Story 2b tests
bun test tests/server/agent-manager.test.ts
```

**Expected:** All pass individually.

### 4. Verify Test Coverage by TC ID

Confirm each TC is covered by checking test names contain the TC ID:

| TC ID | Test File | Expected Test Name Contains |
|-------|-----------|---------------------------|
| TC-3.1a | `tests/client/portlet.test.ts` | "TC-3.1a" |
| TC-3.1b | `tests/client/input.test.ts` | "TC-3.1b" |
| TC-3.2a | `tests/client/chat.test.ts` | "TC-3.2a" |
| TC-3.2b | `tests/client/chat.test.ts` | "TC-3.2b" |
| TC-3.3a | `tests/client/chat.test.ts` | "TC-3.3a" |
| TC-3.3b | `tests/client/chat.test.ts` | "TC-3.3b" |
| TC-3.3c | `tests/client/chat.test.ts` | "TC-3.3c" |
| TC-3.4a | `tests/client/chat.test.ts` | "TC-3.4a" |
| TC-3.5a | `tests/client/input.test.ts` | "TC-3.5a" |
| TC-3.5b | `tests/client/input.test.ts` | "TC-3.5b" |
| TC-3.6a | `tests/client/chat.test.ts` | "TC-3.6a" |
| TC-3.6b | `tests/client/chat.test.ts` | "TC-3.6b" |
| TC-3.6c | `tests/client/chat.test.ts` | "TC-3.6c" |
| TC-3.7a | `tests/client/input.test.ts` | "TC-3.7a" |
| TC-3.7b | `tests/client/portlet.test.ts` | "TC-3.7b" |
| TC-3.7c | `tests/client/input.test.ts` | "TC-3.7c" |
| TC-5.4a | `tests/client/portlet.test.ts` | "TC-5.4a" |

### 5. Smoke Test Checklist (Manual)

If the server is runnable (`bun run dev`), perform these manual checks:

- [ ] Open the app in a browser at `http://localhost:3000`
- [ ] Open/create a session -- chat container and input bar are visible
- [ ] Type a message and send -- message appears immediately as a user turn
- [ ] Agent streams a response -- text appears incrementally (raw, not markdown)
- [ ] Response completes -- text re-renders as formatted markdown (code blocks highlighted, headers formatted)
- [ ] Tool calls display: "running" state shows name + indicator; "complete" state is collapsed with success; "error" state shows error message
- [ ] Thinking blocks render with muted styling and are collapsible
- [ ] During streaming, chat auto-scrolls to keep latest content visible
- [ ] Scroll up during streaming -- auto-scroll pauses, "scroll to bottom" button appears
- [ ] Click "scroll to bottom" -- scrolls to bottom, button hides, auto-scroll resumes
- [ ] Click cancel during streaming -- response stops, partial content remains, input re-enables
- [ ] Cancel button is not visible when no response is in progress
- [ ] Empty input -- send button is disabled
- [ ] Agent status "starting" -- launching indicator appears

### 6. File Inventory Check

Verify the following files exist and were modified in this story:

```bash
ls -la client/portlet/portlet.js client/portlet/chat.js client/portlet/input.js client/shared/markdown.js
ls -la tests/client/chat.test.ts tests/client/input.test.ts tests/client/portlet.test.ts
```

## Constraints

- Do NOT modify any implementation or test files during verification
- If tests fail, report the failures with full error output -- do not fix them in this prompt
- If typecheck fails, report the errors -- do not fix them in this prompt

## If Blocked or Uncertain

- If any tests fail -- report the full error output and stop
- If typecheck has errors -- report them and stop
- Do NOT attempt fixes during the verification phase

## Verification

This entire prompt IS the verification. The expected outcomes are:

1. `bun test` -- 44 tests pass, 0 fail
2. `bun run typecheck` -- 0 errors
3. No regressions in prior story tests
4. All 17 TC IDs present in test names
5. Smoke test checklist completed (if server is runnable)
6. All required files exist

## Done When

- [ ] 44 tests pass (27 prior + 17 new)
- [ ] `bun run typecheck` passes with 0 errors
- [ ] No regressions in Stories 0-2b tests
- [ ] All 17 TC IDs confirmed present in test names
- [ ] Smoke test checklist completed (or noted as blocked with reason)
- [ ] All required files exist and were modified
- [ ] Verification report provided with pass/fail for each check
