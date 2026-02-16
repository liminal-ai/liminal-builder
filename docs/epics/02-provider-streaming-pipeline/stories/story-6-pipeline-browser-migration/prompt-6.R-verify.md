# Prompt 6.R: Story 6 Verification

## Context
Audit pipeline/browser migration behavior and compatibility rules.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Verify
- One-family-per-connection enforced.
- Upsert rendering preserves item isolation and state transitions.
- Session history load path uses canonical pipeline semantics.
- No direct ACP-to-WebSocket path remains in active flow.

## Commands
- `bun run verify`
- `bun run test -- tests/server/websocket/websocket-compatibility.test.ts tests/server/pipeline/pipeline-integration.test.ts tests/server/pipeline/session-history-pipeline.test.ts tests/client/upsert/portlet-upsert-rendering.test.ts`

## Done When
- [ ] Story 6 verified and stable for cleanup phase.
