# Prompt 3.R: Verify (Chat Session UI)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. The stack is Bun + Fastify server, vanilla HTML/JS client using a shell/portlet (iframe) model, with WebSocket bridging the browser to ACP agent processes (Claude Code, Codex) running over JSON-RPC/stdio.

Story 3 implemented the chat interface inside the portlet iframe: message rendering, streaming responses, markdown, auto-scroll, tool calls, thinking blocks, and cancel. This verification phase confirms everything works correctly, with no regressions.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- Story 3 Green phase complete (portlet.js, chat.js, input.js, markdown.js implemented)
- 17 new tests written across 3 test files
- 28 prior tests from Stories 0-2b

## Reference Documents

(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Flow 3: Chat Interaction)
- Feature Spec: `docs/feature-spec-mvp.md` (ACs 3.1-3.7, AC-5.4)

## Task

### 1. Run Quality Gate

```bash
bun run verify
```

**Expected:** All `bun run verify` checks pass (format:check, biome lint, eslint, eslint-plugin tests, typecheck, server tests).

### 2. Run Story 3 Client Tests

```bash
bun run test:client
```

**Expected:** Story 3 client tests pass within the client suite. Total client count may exceed 17 when prior client tests are present.

Breakdown:
- `tests/client/chat.test.ts`: 9 tests (Story 3) -- NEW
- `tests/client/input.test.ts`: 5 tests (Story 3) -- NEW
- `tests/client/portlet.test.ts`: 3 tests (Story 3) -- NEW

### 3. Run Typecheck

```bash
bun run typecheck
```

**Expected:** 0 errors.

### 4. Verify No Regressions

Run regression suites, then optionally isolate prior-story tests if needed:

```bash
# Server regression suite (Stories 1/2a/2b)
bun run test

# Client regression suite (includes Story 1 sidebar + Story 3 client tests)
bun run test:client

# Optional targeted Story 2b isolation
bunx vitest run tests/server/agent-manager.test.ts --passWithNoTests
```

**Expected:** All commands pass.

### 5. Verify Server-Side WS Bridge Coverage

Story 3 modifies `server/websocket.ts` for `session:send`/`session:cancel` and stream fan-out. Verify these changes through existing server regression coverage plus targeted websocket inspection:

```bash
# Server regression suite (already included in bun run verify, rerun if needed)
bun run test

# Focused server bridge tests (if a file has no cases yet, passWithNoTests avoids false failures)
bunx vitest run tests/server/websocket.test.ts tests/server/agent-manager.test.ts --passWithNoTests
```

If `tests/server/websocket.test.ts` has no cases, treat this as a follow-up test gap and rely on Step 8 manual smoke validation for bridge behavior.

### 6. Verify Contract Translation Parity (postMessage <-> WS)

Confirm bridge contracts preserve canonical required fields and apply explicit postMessage translation:

- `session:send` reaches WS with `sessionId` + `content`
- `session:cancel` reaches WS with `sessionId`
- `session:cancelled` from WS includes `sessionId` + `entryId`
- `agent:status` from WS includes `cliType` + `status`
- Parent-shell translation forwards only iframe-required shape after routing by `sessionId`

Suggested inspection command:

```bash
rg -n "session:send|session:cancel|session:cancelled|agent:status|sessionId|entryId|cliType" server/websocket.ts client/shell/shell.js client/portlet/portlet.js
```

### 7. Verify Test Coverage by TC ID

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

### 8. Smoke Test Checklist (Manual)

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

### 9. File Inventory Check

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

1. `bun run test` + `bun run test:client` -- 45 tests pass, 0 fail
2. `bun run verify` -- pass
3. `bun run test:client` -- Story 3 tests pass within the client suite (total may include prior client tests)
4. `bun run typecheck` -- 0 errors
5. Server-side websocket bridge coverage validated (existing server tests and/or noted gap)
6. No regressions in prior story tests
7. Contract translation parity validated (postMessage <-> WS)
8. All 17 TC IDs present in test names
9. Smoke test checklist completed (if server is runnable)
10. All required files exist

## Done When

- [ ] `bun run verify` passes
- [ ] Story 3 client tests pass (17 total)
- [ ] `bun run typecheck` passes with 0 errors
- [ ] Story 3 server-side websocket bridge changes validated (or explicitly reported as coverage gap)
- [ ] No regressions in Stories 0-2b tests
- [ ] Contract translation parity validated (postMessage <-> WS)
- [ ] All 17 TC IDs confirmed present in test names
- [ ] Smoke test checklist completed (or noted as blocked with reason)
- [ ] All required files exist and were modified
- [ ] Verification report provided with pass/fail for each check
