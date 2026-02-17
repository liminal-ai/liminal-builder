# Story 6 Pivot Addendum: Remove Compatibility Window

## Date
2026-02-17

## Decision

Remove the compatibility window (dual message-family routing) from Story 6. Commit directly to the `upsert-v1` message family. Delete legacy message emission paths in this story rather than deferring to Story 7.

## Rationale

1. **Zero consumers of the legacy format.** This is a greenfield app with no external users. The browser client is ours and is being rewritten in the same story. There is no one to migrate.

2. **Compatibility window is ~30% of Story 6 scope and 100% of its accidental complexity.** The `session:hello` negotiation, per-connection family routing, `CompatibilityGateway` abstraction, and dual-path emission testing all exist to serve a migration that has no audience.

3. **Story 7 immediately removes the legacy family.** The compatibility window would exist for exactly one story's duration. Engineering a window for a migration that spans zero time is pure overhead.

4. **Faster path to real-inference testing.** Cutting the window simplifies Story 6, getting to a gorilla-testable state sooner. The highest-priority gap in the epic is verifying that mock-built providers work against real CLI output. Every story of delay increases risk.

5. **Story 7 freed for real work.** Without legacy removal to do, Story 7 can focus entirely on real E2E verification, NFR gates, and dead code cleanup — the work that actually matters.

## What Changes

### Story 6 scope (revised)
- Wire `provider.onUpsert()`/`provider.onTurn()` callbacks through `stream-delivery.ts` to WebSocket
- Send `session:upsert` / `session:turn` / `session:history` messages (upsert-v1 only)
- Delete `createPromptBridgeMessages` and legacy `session:update` / `session:chunk` / `session:complete` / `session:cancelled` emission from active streaming flow
- Migrate browser portlet to render from upsert messages
- Wire session history loading through provider/upsert pipeline

### Removed from Story 6
- `compatibility-gateway.ts` — deleted entirely
- `session:hello` / `session:hello:ack` negotiation protocol
- `StreamProtocolFamily` type, `ConnectionCapabilities`, per-connection family selection
- TC-6.4a (compatibility window for legacy consumers)
- TC-6.4c (single-family-per-connection enforcement)
- Dual-path emission logic

### Story 7 impact
- No legacy-family removal needed (already done in Story 6)
- TC-6.4b (legacy removal complete) becomes trivially satisfied or is folded into Story 6
- Story 7 focuses on: real E2E provider verification, NFR perf gates, dead code cleanup (processor, envelope schema)

### Test count adjustment
- Story 6: 11 tests → 9 tests (remove TC-6.4a, TC-6.4c; keep TC-7.4a rewritten as "legacy emission paths removed")
- TC-7.4a intent changes from "no direct ACP bridge in active flow" to "no legacy message emission paths remain"
- Running total adjusts accordingly

## Implementation Approach

Because Story 6.1 skeleton-red has already been executed (not verified, not committed), we handle this as:

1. **Supplemental skeleton-red prompt** (`prompt-6.1b-pivot-red.md`): surgical delta on 6.1 output — delete compatibility gateway, gut compatibility tests, simplify websocket wiring
2. **Rewritten green prompt** (`prompt-6.2-green.md`): implements direct provider→delivery→browser pipeline with no compatibility routing
3. Story 6 verify prompt (`prompt-6.R-verify.md`) will need minor updates to reflect reduced test count

## Traceability

| Original TC | Disposition |
|---|---|
| TC-6.4a (compatibility window) | **Removed** — no compatibility window needed |
| TC-6.4c (one-family enforcement) | **Removed** — only one family exists |
| TC-7.1a..TC-7.1c (provider delivery) | **Unchanged** |
| TC-7.2a..TC-7.2c (browser rendering) | **Unchanged** |
| TC-7.3a..TC-7.3b (session history) | **Unchanged** |
| TC-7.4a (legacy path removal) | **Rewritten** — asserts legacy emission is deleted, not just bypassed |
