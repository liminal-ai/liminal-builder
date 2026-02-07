# Story 2b — Teammate Validation of Codex Report

## Codex Verdict: NOT READY
## Teammate Verdict: AGREE — NOT READY (correct assessment, though one issue is overstated)

---

### Critical Issue 1: WebSocket contract contradiction (`error` vs `agent:error`)

- **Codex claim:** Feature spec and tech design define `type: 'error'` for error messages (feature-spec:630, tech-design:553), but story/prompts require forwarding as `agent:error` (story:94, prompt-2b.1:474, prompt-2b.2:243, prompt-2b.R:152). Prompt also says "keep existing WS payload contracts stable" while introducing `agent:error`.
- **Validated:** TRUE
- **Evidence:**
  - Feature spec line 630: `| { type: 'error'; requestId?: string; message: string }` — confirmed, the canonical server message type is `error`.
  - Tech design line 553: `| error | Any handler | Error message with context |` — confirmed.
  - Story 2b line 94: `forward agent:status / agent:error to connected clients` — confirmed, uses `agent:error`.
  - Prompt 2b.2 line 243: `AgentManager 'error' event -> WS message type 'agent:error'` — confirmed.
  - Prompt 2b.2 line 247: `Keep existing WS payload contracts stable` — confirmed, directly contradicts introducing a new `agent:error` type.
  - The internal EventEmitter event is named `error` (emitter.emit('error', ...)), but the WS outbound type is changed to `agent:error`. The feature spec only has `error` as a WS message type, never `agent:error`.
- **Severity adjustment:** Keep Critical — This is a genuine contract mismatch between upstream spec and story prompts. An implementer following the prompts would create a `agent:error` WS message type that doesn't exist in the feature spec contract, breaking client expectations.

### Critical Issue 2: Type-level contradiction (`Record<CliType, ...>` with only `claude-code` key)

- **Codex claim:** `CliType` is `'claude-code' | 'codex'` but `ACP_COMMANDS` uses `Record<CliType, ...>` with only the `claude-code` key. This would fail TypeScript typecheck. Prompt forbids adding codex config but expects zero type errors.
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - Prompt 2b.1 line 161: `const ACP_COMMANDS: Record<CliType, { cmd: string; args: string[] }> = { 'claude-code': ... }` — confirmed, only one key for a 2-member union.
  - Prompt 2b.2 line 92/274: Same pattern with `Record<CliType, { cmd: string; args: string[]; displayName: string }>` — confirmed.
  - Prompt 2b.2 line 516: `Do NOT implement Codex runtime command/config` — confirmed.
  - Prompt 2b.2 line 555: `Expected output: Zero type errors` — confirmed.
  - However, in TypeScript, `Record<CliType, T>` with a missing key **does compile** — `Record` creates an index signature that doesn't require all keys to be present at the value level. The type error would only occur with `StrictCheck` or explicit exhaustiveness checking. In standard TS, this actually compiles fine.
  - **But:** The runtime behavior is problematic. `ACP_COMMANDS[cliType]` where `cliType === 'codex'` would return `undefined`, potentially causing a runtime crash. This is a correctness issue, not a typecheck issue.
- **Severity adjustment:** Downgrade to Major — Not a typecheck blocker as Codex claims, but a genuine runtime safety issue. The prompt should use `Partial<Record<CliType, ...>>` or add an explicit codex placeholder. Codex overstated this as "will fail typecheck" — it won't, but it's still a real problem.

---

### Major Issue 1: Dependency gating inconsistent with story graph

- **Codex claim:** Story graph says 2b depends only on 0 + 2a, but story.md and prompts list Story 1 as a prerequisite.
- **Validated:** TRUE
- **Evidence:**
  - Overview line 25: `Stories 1 and 2a can execute in parallel after Story 0. Stories 3-6 run sequentially` — Story 2b depends on 2a only (which depends on 0). No mention of Story 1 as prerequisite for 2b.
  - Story 2b story.md line 14: `Story 1 complete: 9 tests passing` — listed as prerequisite.
  - Prompt 2b.1 line 19: `17 tests passing (9 from Story 1 + 8 from Story 2a)` — implies Story 1 complete.
  - The dependency graph shows `Story 0 -> Story 2a -> Story 2b`. Story 1 is a parallel track.
  - However, Story 1 isn't a *functional* dependency — it's a *regression baseline* dependency. Story 2b doesn't use sidebar code, but the prompts reference "17 tests passing" which includes Story 1's 9 tests. The prerequisite is about test baseline, not code dependency.
- **Severity adjustment:** Downgrade to Minor — The dependency is for regression baseline, not functional dependency. Story 2b could execute without Story 1 complete as long as the test runner doesn't choke on missing Story 1 tests. The wording is misleading but not blocking.

### Major Issue 2: WebSocket test scope not implementation-ready

- **Codex claim:** Story lists WS test scope without concrete count/cases (story.md:71). Red prompt gives only high-level WS bullets (prompt-2b.1:469).
- **Validated:** TRUE
- **Evidence:**
  - Story.md line 71: `tests/server/websocket.test.ts | Story 2b WS scope | session:create/open/send/cancel routing + agent:status/error forwarding` — no test count, just "Story 2b WS scope".
  - Prompt 2b.1 lines 469-475: Describes WS bridge coverage as 5 bullet points (4 inbound routes + 2 outbound events) without numbered test cases, mock setups, or expected payloads.
  - Contrast with AgentManager tests: prompt 2b.1 lines 177-447 provides complete test code for all 10 tests with mocks, assertions, and everything.
  - The WS tests are dramatically under-specified compared to the AgentManager tests.
- **Severity adjustment:** Keep Major — A fresh-context engineer would struggle to write WS bridge tests from the high-level bullets. The AgentManager tests are fully self-contained; the WS tests are not. This violates the "self-contained prompt" principle.

### Major Issue 3: Reconnect interface naming inconsistency

- **Codex claim:** Tech design uses both `manualReconnect` (lines 1070, 534) and `reconnect` (line 1448). Prompts use `reconnect`.
- **Validated:** TRUE
- **Evidence:**
  - Tech design line 1070: `async manualReconnect(cliType: CliType): Promise<void>;` — confirmed, in the AgentManager pseudocode interface.
  - Tech design line 534: `session:reconnect | agent-manager.manualReconnect(cliType)` — confirmed, WS routing table uses `manualReconnect`.
  - Tech design line 1448: `async reconnect(cliType: CliType): Promise<void>;` — confirmed, in the full interface spec.
  - Prompt 2b.1 line 125: `async reconnect(cliType: CliType): Promise<void>` — uses `reconnect`.
  - The tech design has the name split between two sections. Lines 1060-1070 use `reconnect` (private) and `manualReconnect` (public). Line 1448 collapses to just `reconnect`.
- **Severity adjustment:** Keep Major — An implementer could wire the WS `session:reconnect` handler to call `reconnect()` while the routing table says `manualReconnect()`. Must normalize.

---

### Minor Issue 1: AC scope labeling drift

- **Codex claim:** Feature spec Story 2b ACs are 5.1/5.3/5.5, but story adds AC-5.2 partial.
- **Validated:** TRUE
- **Evidence:**
  - Feature spec line 787-789: ACs 5.1, 5.3, 5.5 — confirmed.
  - Story.md line 23: `AC-5.2 | Partial | Agent lifecycle state tracking` — confirmed, adds AC-5.2 partial.
  - The "Partial" note makes sense (state tracking is 2b, UI indicators are Story 6), but the feature spec's Story 2b summary doesn't mention AC-5.2 at all.
- **Severity adjustment:** Keep Minor — Accurate observation. The partial coverage is reasonable but should be noted in the feature spec or at least explicitly called out as "bonus scope."

### Minor Issue 2: No explicit unsupported cliType behavior

- **Codex claim:** Prompts hardcode `ensureAgent('claude-code')` but client contract includes `cliType` on `session:create`. Missing explicit behavior for unsupported cliType.
- **Validated:** TRUE
- **Evidence:**
  - Prompt 2b.2 line 236: `session:create -> ensureAgent('claude-code')` — hardcoded.
  - Feature spec line 604: `| { type: 'session:create'; projectId: string; cliType: 'claude-code' | 'codex' }` — client CAN send `codex`.
  - If a `session:create` arrives with `cliType: 'codex'`, Story 2b has no defined behavior. The prompt hardcodes `claude-code` routing.
- **Severity adjustment:** Keep Minor — Reasonable for MVP Story 2b scope (claude-code only). Should still have an explicit "reject unsupported cliType" response rather than undefined behavior.

---

## Missed Issues

### Missed Issue 1: `AgentState` interface inconsistency between prompts (Minor)

- Prompt 2b.1 line 84-89 defines `AgentState` WITHOUT `reconnectTimer`:
  ```typescript
  export interface AgentState {
    status: AgentStatus;
    process: any | null;
    client: AcpClient | null;
    reconnectAttempts: number;
  }
  ```
- Prompt 2b.2 line 80-86 adds `reconnectTimer: ReturnType<typeof setTimeout> | null`:
  ```typescript
  export interface AgentState {
    status: AgentStatus;
    process: any | null;
    client: AcpClient | null;
    reconnectAttempts: number;
    reconnectTimer: ReturnType<typeof setTimeout> | null;
  }
  ```
- The skeleton prompt omits a field that the green prompt requires. An implementer building the skeleton from prompt 2b.1 would create an interface missing `reconnectTimer`, then prompt 2b.2 would need to add it. Not blocking but inconsistent.

### Missed Issue 2: `requestId` never referenced in Story 2b prompts (Minor)

- Feature spec line 596-601 defines `requestId` as an optional field on all client messages for response correlation.
- Story 2b prompts never mention `requestId`. The WS bridge routing doesn't pass through or correlate `requestId`.
- This means error responses from Story 2b operations won't be correlated to the request that triggered them, breaking the feature spec's correlation design.

---

## Summary

**Codex report quality: Good.** The Codex agent identified the key issues accurately and provided specific line references. All claims were verifiable.

**Adjustments:**
- Critical Issue 2 downgraded to Major (not a typecheck failure, but a runtime safety issue)
- Major Issue 1 downgraded to Minor (regression baseline, not functional dependency)
- Found 2 missed issues (both Minor)

**Final issue count:**
- Critical: 1 (WS error contract mismatch)
- Major: 3 (WS test under-specification, reconnect naming, Record<CliType> runtime safety)
- Minor: 4 (AC scope drift, unsupported cliType, AgentState interface mismatch, requestId missing)

**Final readiness verdict: NOT READY** — The Critical WS contract issue must be resolved, and the Major WS test under-specification needs concrete test cases before a fresh-context engineer can execute.
