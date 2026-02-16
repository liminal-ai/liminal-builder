# Story 2: Upsert Stream Processor

## Overview
Implement the processor that transforms canonical events into upsert objects and turn lifecycle events with deterministic batching, correlation, and terminal behavior.

## Prerequisites
- Story 1 complete and passing.
- Canonical schemas and provider interfaces stable.

## ACs Covered
- AC-5.1, AC-5.2, AC-5.3, AC-5.4

## TCs Covered
- TC-5.1a through TC-5.1d
- TC-5.2a through TC-5.2f
- TC-5.3a through TC-5.3b
- TC-5.4a through TC-5.4f

## Files

**Create/Modify:**
- `server/streaming/upsert-stream-processor.ts`
- `tests/server/streaming/upsert-stream-processor.test.ts`

## Test Breakdown
- `tests/server/streaming/upsert-stream-processor.test.ts`: 18 tests
- Story total: 18
- Running total: 32

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-2.1-skeleton-red.md` | Stub processor API and write failing tests |
| Green | `prompt-2.2-green.md` | Implement processor behavior for all Story 2 TCs |
| Verify | `prompt-2.R-verify.md` | Validate processor correctness and regression safety |
