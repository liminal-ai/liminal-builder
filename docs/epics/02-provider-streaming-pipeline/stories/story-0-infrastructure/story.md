# Story 0: Infrastructure and Contracts Setup

## Overview
Create shared feature infrastructure: core errors, type contracts, Zod validation schemas, barrel exports, test fixtures, and test utilities. Install required dependencies. Fix pre-existing format issues that would block verification gates.

No TDD cycle, no user-facing functionality. Validation tests that close ACs covered here are implemented in Story 1 (Contracts).

## Prerequisites
- Existing project compiles (`bun run typecheck` passes).
- No other story in this epic has started.
- Pre-existing format failures in the repo baseline are resolved (either in this story or as a prerequisite task — see prompt 0.1 for details).

## ACs Delivered
Story 0 delivers the type surface and schema definitions for:
- **AC-1.1** — Canonical stream event Zod schemas (validation tests in Story 1)
- **AC-1.2** — Correlation ID fields in envelope and payload types (validation tests in Story 1)
- **AC-1.3** — Phase 2 provenance fields and explicit derivation boundary documentation (validation tests in Story 1)
- **AC-2.1** — Provider interface type surface (compile-time conformance tests added in Stories 4 and 5 when providers are created)

ACs are not formally closed until Story 1 adds the 12 contract validation tests.

## Files

**Create:**
- `server/providers/provider-errors.ts`
- `server/providers/provider-types.ts`
- `server/providers/index.ts` (barrel)
- `server/streaming/stream-event-schema.ts`
- `server/streaming/upsert-types.ts`
- `server/streaming/index.ts` (barrel)
- `shared/stream-contracts.ts`
- `tests/fixtures/constants.ts`
- `tests/fixtures/stream-events.ts`
- `tests/fixtures/upserts.ts`
- `tests/helpers/provider-mocks.ts`
- `tests/helpers/stream-assertions.ts`

**Update:**
- `package.json` (add `zod`, `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`)
- `tests/server/acp-client.test.ts` (format fix only)
- `tests/server/websocket.test.ts` (format fix only)

## Test Breakdown
- Story 0 total: 0 tests (validation tests are in Story 1)
- Running total: 0

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Setup | `prompt-0.1-setup.md` | Install deps, fix format, build all infrastructure artifacts |
| Verify | `prompt-0.R-verify.md` | Confirm setup, typecheck, format, and fixture-schema alignment |
