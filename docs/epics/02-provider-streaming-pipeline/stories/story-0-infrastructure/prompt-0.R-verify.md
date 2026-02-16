# Prompt 0.R: Story 0 Verification

## Context
You are verifying Story 0 of the Provider Streaming Pipeline epic. Story 0 is infrastructure-only: types, Zod schemas, error classes, test fixtures, test helpers, barrel exports, and dependency installation. No runtime logic. No tests.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Verification Scope
1. All infrastructure artifacts exist and are coherent.
2. Dependencies are installed.
3. Zod schemas validate correctly at runtime.
4. Fixtures match their schemas.
5. No test files were added.
6. All verification gates pass.

## Checklist

### 1. File Existence
Confirm all files exist:
- `server/providers/provider-errors.ts`
- `server/providers/provider-types.ts`
- `server/providers/index.ts`
- `server/streaming/stream-event-schema.ts`
- `server/streaming/upsert-types.ts`
- `server/streaming/index.ts`
- `shared/stream-contracts.ts`
- `tests/fixtures/constants.ts`
- `tests/fixtures/stream-events.ts`
- `tests/fixtures/upserts.ts`
- `tests/helpers/provider-mocks.ts`
- `tests/helpers/stream-assertions.ts`

### 2. Dependency Verification
Confirm `package.json` includes:
- `zod` in dependencies
- `@anthropic-ai/claude-agent-sdk` in dependencies
- `@anthropic-ai/sdk` in devDependencies

Confirm `bun.lockb` or `bun.lock` was updated.

### 3. Schema Coherence
Verify in `server/streaming/stream-event-schema.ts`:
- `streamEventEnvelopeSchema` enforces `type === payload.type` via `.refine()`
- `timestamp` uses `z.string().datetime()` (not plain `z.string()`)
- `finalizedItemSchema` is a concrete Zod discriminated union (not `z.unknown()`)
- `usageSchema` has concrete fields (`inputTokens`, `outputTokens`, optional cache fields) — not `z.unknown()`
- All 8 event types are covered in `streamEventPayloadSchema`: `response_start`, `item_start`, `item_delta`, `item_done`, `item_error`, `item_cancelled`, `response_done`, `response_error`
- `item_cancelled.reason` uses constrained cancellation values (schema-backed enum), not arbitrary strings
- `response_done.status === "error"` supports structured `error: { code, message }` details

### 4. Phase 2 Boundary Documentation
Verify in `server/streaming/upsert-types.ts`:
- Module-level comment explicitly documents that `turnSequenceNumber`, `llmTurnNumber`, and canonical `entryType` derivation are deferred to Phase 2 Tech Design
- `sourceTimestamp` and `emittedAt` fields are present on `UpsertObjectBase`

### 5. Naming Consistency Check
Verify the `toolOutputIsError` / `isError` naming boundary:
- `ToolCallUpsert` uses `toolOutputIsError` (with disambiguating comment)
- `FinalizedItem.function_call_output` uses `isError`
- The naming difference is intentional and commented
- `ToolCallUpsert.toolArguments` comment clarifies create-time arguments may be partial/empty

### 6. Type Reuse (No Duplication)
- `CliType` in `provider-types.ts` is re-exported from `server/sessions/session-types.ts`, not redefined
- `NotImplementedError` is NOT duplicated (only exists in `server/errors.ts`)

### 7. Fixture-Schema Alignment Smoke Test
Run this inline to confirm fixtures validate against schemas:
```bash
bun -e "Promise.all([import('@server/streaming'), import('@tests/fixtures/stream-events')]).then(([streaming, fixtures]) => {
  const { streamEventEnvelopeSchema } = streaming;
  const validFixtures = fixtures.ALL_VALID_STREAM_EVENT_FIXTURES;
  const malformedFixtures = fixtures.ALL_MALFORMED_STREAM_EVENT_FIXTURES;
  let passed = 0;
  for (const f of validFixtures) {
    const r = streamEventEnvelopeSchema.safeParse(f);
    if (!r.success) {
      console.error('FAIL:', f?.payload?.type, r.error.issues);
      process.exit(1);
    }
    passed++;
  }
  let rejected = 0;
  for (const m of malformedFixtures) {
    const r = streamEventEnvelopeSchema.safeParse(m);
    if (r.success) {
      console.error('SHOULD HAVE FAILED:', m);
      process.exit(1);
    }
    rejected++;
  }
  console.log('Fixture validation:', passed, 'valid parsed,', rejected, 'invalid rejected');
}).catch((e) => {
  console.error(e);
  process.exit(1);
})"
```

### 8. Import Resolution
Confirm barrel exports resolve:
```bash
bun -e "import('@server/providers/index.ts').then(() => console.log('providers barrel: OK')).catch(e => { console.error(e); process.exit(1) })"
bun -e "import('@server/streaming/index.ts').then(() => console.log('streaming barrel: OK')).catch(e => { console.error(e); process.exit(1) })"
```

### 9. No Test Files Added
```bash
git diff --name-only --diff-filter=A | rg '^tests/.*\\.test\\.ts$'
```
Expected: no output (no newly added test files in Story 0).

### 10. Path Alias Usage
Spot-check that cross-directory imports use `@server/*`, `@shared/*`, `@tests/*` aliases. Same-directory barrel files may use relative imports.

## Verification Commands
Run in order:
1. `bun run format:check` — 0 errors
2. `bun run lint` — 0 errors
3. `bun run typecheck` — 0 errors
4. `bun run red-verify` — passes

## Done When
- [ ] All 12 infrastructure files exist
- [ ] Dependencies installed and lockfile updated
- [ ] `package.json` includes the 3 dependency additions
- [ ] Format-only updates are present where required (`tests/server/acp-client.test.ts`, `tests/server/websocket.test.ts`), plus any additional repo-wide formatter touch-ups
- [ ] Schema coherence verified (datetime, finalizedItem, usage, refine)
- [ ] Phase 2 boundary documented in upsert-types
- [ ] Naming boundary commented (toolOutputIsError vs isError)
- [ ] No CliType/NotImplementedError duplication
- [ ] Fixture-schema alignment smoke test passes
- [ ] Barrel imports resolve
- [ ] No `.test.ts` files added
- [ ] Path aliases used consistently
- [ ] `bun run red-verify` passes
