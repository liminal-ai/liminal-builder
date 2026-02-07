# Prompt 2a.1: Skeleton + Red (ACP Client Tests)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs (Claude Code, Codex). The stack is Bun + Fastify server with vanilla HTML/JS client, communicating via WebSocket. The server bridges browser WebSocket connections to CLI agent processes via the ACP (Agent Client Protocol), which uses JSON-RPC 2.0 over stdio.

Story 2a isolates the ACP protocol layer. The `AcpClient` class wraps stdin/stdout of a child process and implements the JSON-RPC 2.0 protocol for communicating with ACP agent adapters. This prompt creates the test file with 9 tests covering all ACP protocol operations, plus ensures the AcpClient class skeleton is ready for them. New tests should fail meaningfully against unimplemented behavior at this stage.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `server/acp/acp-types.ts` -- ACP protocol types (from Story 0)
- `server/acp/acp-client.ts` -- AcpClient class stub (from Story 0)
- `server/errors.ts` -- NotImplementedError, AppError (from Story 0)
- `shared/types.ts` -- ChatEntry discriminated union (from Story 0)
- `tests/fixtures/acp-messages.ts` -- Mock ACP responses (from Story 0)
- Story 1 is optional for Story 2a execution; if Story 1 is complete there are 9 prior server tests, otherwise baseline may be Story 0 only

## Reference Documents
(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (ACP Protocol Surface, AcpClient interface, ACP client test mapping)
- Feature Spec: `docs/feature-spec-mvp.md` (Flow 5: Agent Connection Lifecycle)

## Task

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `tests/server/acp-client.test.ts` | **Create** | 9 tests covering ACP protocol correctness |
| `server/acp/acp-client.ts` | **Verify/Update** | Ensure class skeleton matches interface below |
| `tests/fixtures/acp-messages.ts` | **Update** | Add mock stdio helpers for test setup |

### ACP Protocol Types (from `server/acp/acp-types.ts`)

These types ALREADY exist from Story 0. Do NOT recreate them. Reference them via imports.

```typescript
// server/acp/acp-types.ts

/** JSON-RPC 2.0 request */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 response */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** JSON-RPC 2.0 notification (no id) */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

/** ACP session/new result */
export interface AcpCreateResult {
  sessionId: string;
}

/** ACP initialize params */
export interface AcpInitializeParams {
  protocolVersion: 1;
  clientInfo: { name: string; title: string; version: string };
  clientCapabilities: {
    fileSystem?: { readTextFile?: boolean; writeTextFile?: boolean };
    terminal?: boolean;
  };
}

/** ACP initialize result */
export interface AcpInitializeResult {
  protocolVersion: number;
  agentInfo: { name: string; title: string; version: string };
  agentCapabilities: {
    loadSession?: boolean;
    promptCapabilities?: { image?: boolean; embeddedContext?: boolean };
  };
}

/** ACP session/prompt result -- signals turn completion */
export interface AcpPromptResult {
  stopReason: 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';
}

/** ACP content block (used in messages and tool results) */
export interface AcpContentBlock {
  type: 'text';
  text: string;
}

/** ACP session/update notification types */
export type AcpUpdateEvent =
  | { type: 'agent_message_chunk'; content: AcpContentBlock[] }
  | { type: 'agent_thought_chunk'; content: AcpContentBlock[] }
  | { type: 'user_message_chunk'; content: AcpContentBlock[] }
  | { type: 'tool_call'; toolCallId: string; title: string; kind?: string;
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      content?: AcpContentBlock[]; locations?: Array<{ path: string; line?: number }> }
  | { type: 'tool_call_update'; toolCallId: string;
      status?: 'pending' | 'in_progress' | 'completed' | 'failed';
      content?: AcpContentBlock[]; locations?: Array<{ path: string; line?: number }> }
  | { type: 'plan'; entries: Array<{ content: string; priority: string; status: string }> }
  | { type: 'config_options_update'; options: unknown[] }
  | { type: 'current_mode_update'; currentModeId: string }

/** ACP permission request (agent -> client) */
export interface AcpPermissionRequest {
  toolCallId: string;
  title: string;
  description?: string;
}
```

### ChatEntry Type (from `shared/types.ts`)

```typescript
type ChatEntry =
  | { entryId: string; type: 'user'; content: string; timestamp: string }
  | { entryId: string; type: 'assistant'; content: string; timestamp: string }
  | { entryId: string; type: 'thinking'; content: string }
  | { entryId: string; type: 'tool-call'; toolCallId: string; name: string;
      status: 'running' | 'complete' | 'error'; result?: string; error?: string }
```

### AcpClient Class Interface

The `AcpClient` class in `server/acp/acp-client.ts` should have this skeleton. If the existing stub from Story 0 does not match, update it to match.

```typescript
// server/acp/acp-client.ts

import type {
  AcpInitializeResult,
  AcpCreateResult,
  AcpPromptResult,
  AcpUpdateEvent,
} from './acp-types';
import type { ChatEntry } from '../../shared/types';

/**
 * JSON-RPC client communicating with an ACP agent process over stdio.
 * Implements newline-delimited JSON-RPC 2.0.
 *
 * Constructor takes stdin (writable) and stdout (readable) of the child process.
 * Tests mock these with in-memory streams.
 */
export class AcpClient {
  private nextId = 1;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private agentCapabilities: AcpInitializeResult['agentCapabilities'] | null = null;
  private eventHandlers = new Map<string, (event: AcpUpdateEvent) => void>();
  private errorHandler: ((error: Error) => void) | null = null;
  private stdin: WritableStream;
  private stdout: ReadableStream;

  constructor(stdin: WritableStream, stdout: ReadableStream) {
    this.stdin = stdin;
    this.stdout = stdout;
    // NOTE: Do NOT start reading stdout in the constructor.
    // Reading starts in initialize() to keep construction synchronous.
  }

  /** Send initialize handshake, negotiate capabilities.
   *  Advertises fileSystem + terminal capabilities.
   *  Stores agent capabilities (loadSession, etc.) for later use. */
  async initialize(): Promise<AcpInitializeResult> {
    throw new NotImplementedError('AcpClient.initialize');
  }

  /** session/new -- Create a new session with working directory */
  async sessionNew(params: { cwd: string }): Promise<AcpCreateResult> {
    throw new NotImplementedError('AcpClient.sessionNew');
  }

  /** session/load -- Resume session. Agent replays history as session/update
   *  notifications before responding. Collects replayed events into ChatEntry[].
   *  Requires agent capability: loadSession */
  async sessionLoad(sessionId: string, cwd: string): Promise<ChatEntry[]> {
    throw new NotImplementedError('AcpClient.sessionLoad');
  }

  /** session/prompt -- Send user message. The agent streams session/update
   *  notifications (text chunks, tool calls, thinking). The prompt response
   *  with stopReason signals completion.
   *  onEvent callback fires for each session/update notification.
   *  Returns the final stopReason. */
  async sessionPrompt(
    sessionId: string,
    content: string,
    onEvent: (event: AcpUpdateEvent) => void
  ): Promise<AcpPromptResult> {
    throw new NotImplementedError('AcpClient.sessionPrompt');
  }

  /** session/cancel -- Cancel in-progress prompt (notification, no response) */
  sessionCancel(sessionId: string): void {
    throw new NotImplementedError('AcpClient.sessionCancel');
  }

  /** Close stdin to signal shutdown. Wait up to timeoutMs for exit. */
  async close(timeoutMs?: number): Promise<void> {
    throw new NotImplementedError('AcpClient.close');
  }

  /** Register handler for unexpected errors (broken pipe, parse error) */
  onError(handler: (error: Error) => void): void {
    throw new NotImplementedError('AcpClient.onError');
  }

  /** Whether agent supports session/load */
  get canLoadSession(): boolean {
    return this.agentCapabilities?.loadSession ?? false;
  }
}
```

### Mock Stdio Helper

Update `tests/fixtures/acp-messages.ts` to include a `MockStdio` helper that simulates an ACP agent's stdin/stdout for testing. The mock must support:

1. **Capturing writes to stdin** -- record what the client sends (JSON-RPC requests)
2. **Injecting responses via stdout** -- push JSON-RPC responses and notifications that the client reads
3. **Newline-delimited framing** -- each message is a complete JSON object followed by `\n`

```typescript
// tests/fixtures/acp-messages.ts (ADD to existing file)

/**
 * Mock stdio pair for testing AcpClient.
 * Simulates the stdin/stdout of a child process.
 *
 * Usage:
 *   const mock = createMockStdio();
 *   const client = new AcpClient(mock.stdin, mock.stdout);
 *
 *   // Queue a response the client will read
 *   mock.pushResponse({ jsonrpc: '2.0', id: 1, result: { ... } });
 *
 *   // After client sends, check what was written
 *   const sent = mock.getSentMessages();
 */
export function createMockStdio() {
  const sentMessages: unknown[] = [];
  const responseQueue: string[] = [];
  let responseResolve: (() => void) | null = null;

  // Writable stdin -- captures writes
  const stdinWriter = {
    write(chunk: string) {
      const lines = chunk.split('\n').filter(l => l.trim());
      for (const line of lines) {
        sentMessages.push(JSON.parse(line));
      }
    },
    close() { /* no-op for tests */ },
  };

  // Readable stdout -- yields queued responses
  // Implementation: an async iterable that yields lines from responseQueue
  const stdoutReader = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<{ value: string; done: boolean }> {
          while (responseQueue.length === 0) {
            await new Promise<void>(resolve => { responseResolve = resolve; });
          }
          return { value: responseQueue.shift()!, done: false };
        },
      };
    },
  };

  return {
    stdin: stdinWriter as unknown as WritableStream,
    stdout: stdoutReader as unknown as ReadableStream,

    /** Queue a JSON-RPC message for the client to read */
    pushMessage(msg: unknown) {
      responseQueue.push(JSON.stringify(msg) + '\n');
      if (responseResolve) {
        const r = responseResolve;
        responseResolve = null;
        r();
      }
    },

    /** Get all messages sent by the client to stdin */
    getSentMessages(): unknown[] {
      return [...sentMessages];
    },

    /** Queue multiple messages */
    pushMessages(msgs: unknown[]) {
      for (const msg of msgs) {
        this.pushMessage(msg);
      }
    },
  };
}

// --- Mock ACP response factories ---

export function mockInitializeResponse(id: number, overrides?: Partial<{
  loadSession: boolean;
}>) {
  return {
    jsonrpc: '2.0' as const,
    id,
    result: {
      protocolVersion: 1,
      agentInfo: { name: 'mock-agent', title: 'Mock Agent', version: '1.0.0' },
      agentCapabilities: {
        loadSession: overrides?.loadSession ?? true,
        promptCapabilities: { image: false, embeddedContext: false },
      },
    },
  };
}

export function mockSessionNewResponse(id: number, sessionId: string) {
  return {
    jsonrpc: '2.0' as const,
    id,
    result: { sessionId },
  };
}

export function mockSessionLoadResponse(id: number) {
  return {
    jsonrpc: '2.0' as const,
    id,
    result: {},
  };
}

export function mockSessionPromptResponse(id: number, stopReason = 'end_turn') {
  return {
    jsonrpc: '2.0' as const,
    id,
    result: { stopReason },
  };
}

export function mockUpdateNotification(sessionId: string, event: unknown) {
  return {
    jsonrpc: '2.0' as const,
    method: 'session/update',
    params: { sessionId, update: event },
  };
}

export function mockPermissionRequest(id: number, toolCallId: string, title: string) {
  return {
    jsonrpc: '2.0' as const,
    id,
    method: 'session/request_permission',
    params: { toolCallId, title },
  };
}

export function mockJsonRpcError(id: number, code: number, message: string) {
  return {
    jsonrpc: '2.0' as const,
    id,
    error: { code, message },
  };
}
```

### Test File

Create `tests/server/acp-client.test.ts` with 9 tests. Each test uses the mock stdio helper to simulate an ACP agent process.

```typescript
// tests/server/acp-client.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AcpClient } from '../../server/acp/acp-client';
import {
  createMockStdio,
  mockInitializeResponse,
  mockSessionNewResponse,
  mockSessionLoadResponse,
  mockSessionPromptResponse,
  mockUpdateNotification,
  mockPermissionRequest,
  mockJsonRpcError,
} from '../fixtures/acp-messages';
import type { AcpUpdateEvent } from '../../server/acp/acp-types';

describe('AcpClient', () => {
  let mock: ReturnType<typeof createMockStdio>;
  let client: AcpClient;

  beforeEach(() => {
    mock = createMockStdio();
    client = new AcpClient(mock.stdin, mock.stdout);
  });

  it('initialize sends correct protocol version and capabilities', async () => {
    // Queue the initialize response (agent will respond to request id 1)
    mock.pushMessage(mockInitializeResponse(1));

    const result = await client.initialize();

    // Verify what was sent to stdin
    const sent = mock.getSentMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: 1,
        clientInfo: {
          name: expect.any(String),
          title: expect.any(String),
          version: expect.any(String),
        },
        clientCapabilities: {
          fileSystem: { readTextFile: true, writeTextFile: true },
          terminal: true,
        },
      },
    });

    // Verify result
    expect(result.protocolVersion).toBe(1);
    expect(result.agentInfo.name).toBe('mock-agent');
    expect(result.agentCapabilities.loadSession).toBe(true);

    // Verify capabilities stored
    expect(client.canLoadSession).toBe(true);
  });

  it('sessionNew sends cwd parameter and returns sessionId', async () => {
    // Initialize first
    mock.pushMessage(mockInitializeResponse(1));
    await client.initialize();

    // Queue session/new response
    mock.pushMessage(mockSessionNewResponse(2, 'sess-abc123'));

    const result = await client.sessionNew({ cwd: '/home/user/project' });

    const sent = mock.getSentMessages();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      method: 'session/new',
      params: { cwd: '/home/user/project' },
    });

    expect(result.sessionId).toBe('sess-abc123');
  });

  it('sessionLoad collects replayed history from update notifications', async () => {
    // Initialize
    mock.pushMessage(mockInitializeResponse(1));
    await client.initialize();

    // Queue: replay notifications THEN load response
    // The agent replays history as session/update notifications before
    // sending the session/load response.
    mock.pushMessages([
      mockUpdateNotification('sess-123', {
        type: 'user_message_chunk',
        content: [{ type: 'text', text: 'Hello agent' }],
      }),
      mockUpdateNotification('sess-123', {
        type: 'agent_message_chunk',
        content: [{ type: 'text', text: 'Hello! How can I help?' }],
      }),
      mockUpdateNotification('sess-123', {
        type: 'tool_call',
        toolCallId: 'tc-1',
        title: 'Read File',
        status: 'completed',
        content: [{ type: 'text', text: 'file contents' }],
      }),
      mockSessionLoadResponse(2),
    ]);

    const history = await client.sessionLoad('sess-123', '/home/user/project');

    // Should have collected the replayed notifications into ChatEntry[]
    expect(history).toHaveLength(3);
    expect(history[0]).toMatchObject({ type: 'user', content: 'Hello agent' });
    expect(history[1]).toMatchObject({ type: 'assistant', content: 'Hello! How can I help?' });
    expect(history[2]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tc-1',
      name: 'Read File',
      status: 'complete',
    });

    // Verify session/load request was sent
    const sent = mock.getSentMessages();
    expect(sent[1]).toMatchObject({
      method: 'session/load',
      params: { sessionId: 'sess-123', cwd: '/home/user/project' },
    });
  });

  it('sessionPrompt fires onEvent for each update notification', async () => {
    // Initialize
    mock.pushMessage(mockInitializeResponse(1));
    await client.initialize();

    // Queue: streaming notifications then prompt response
    mock.pushMessages([
      mockUpdateNotification('sess-123', {
        type: 'agent_message_chunk',
        content: [{ type: 'text', text: 'Here is my ' }],
      }),
      mockUpdateNotification('sess-123', {
        type: 'agent_message_chunk',
        content: [{ type: 'text', text: 'response.' }],
      }),
      mockUpdateNotification('sess-123', {
        type: 'tool_call',
        toolCallId: 'tc-2',
        title: 'Write File',
        status: 'in_progress',
      }),
      mockSessionPromptResponse(2, 'end_turn'),
    ]);

    const events: AcpUpdateEvent[] = [];
    const result = await client.sessionPrompt(
      'sess-123',
      'Write a file for me',
      (event) => events.push(event)
    );

    // All streaming events received in order
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('agent_message_chunk');
    expect(events[1].type).toBe('agent_message_chunk');
    expect(events[2].type).toBe('tool_call');

    // Prompt completed with stopReason
    expect(result.stopReason).toBe('end_turn');
  });

  it('sessionPrompt resolves with stopReason on completion', async () => {
    // Initialize
    mock.pushMessage(mockInitializeResponse(1));
    await client.initialize();

    // Queue: just the prompt response (no streaming events)
    mock.pushMessage(mockSessionPromptResponse(2, 'max_tokens'));

    const result = await client.sessionPrompt('sess-123', 'Hello', () => {});

    expect(result).toEqual({ stopReason: 'max_tokens' });
  });

  it('handleAgentRequest auto-approves permission requests', async () => {
    // Initialize
    mock.pushMessage(mockInitializeResponse(1));
    await client.initialize();

    // Agent sends a permission request (this is a JSON-RPC request FROM agent TO client)
    // The client must auto-approve by responding with { approved: true }
    // We simulate this during a prompt call -- the permission request arrives
    // interleaved with streaming updates.
    mock.pushMessages([
      // Agent asks for permission (JSON-RPC request with id)
      mockPermissionRequest(100, 'tc-perm', 'Execute bash command'),
      // Then prompt completes
      mockSessionPromptResponse(2, 'end_turn'),
    ]);

    await client.sessionPrompt('sess-123', 'Run a command', () => {});

    // Verify the client sent back an approval response
    const sent = mock.getSentMessages();
    // Find the response to the permission request (id: 100)
    const approvalResponse = sent.find(
      (msg: any) => msg.id === 100 && msg.result
    );
    expect(approvalResponse).toBeTruthy();
    expect((approvalResponse as any).result).toMatchObject({ approved: true });
  });

  it('handles JSON-RPC error responses', async () => {
    // Initialize
    mock.pushMessage(mockInitializeResponse(1));
    await client.initialize();

    // Queue an error response to session/new
    mock.pushMessage(mockJsonRpcError(2, -32600, 'Invalid session parameters'));

    await expect(
      client.sessionNew({ cwd: '/nonexistent' })
    ).rejects.toThrow('Invalid session parameters');
  });

  it('sessionCancel sends a JSON-RPC notification (no id field)', async () => {
    // Initialize
    mock.pushMessage(mockInitializeResponse(1));
    await client.initialize();

    client.sessionCancel('sess-123');

    const sent = mock.getSentMessages();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/cancel',
      params: { sessionId: 'sess-123' },
    });
    expect(sent[1]).not.toHaveProperty('id');
  });

  it('close sends stdin close and cleans up pending state', async () => {
    // Initialize first
    mock.pushMessage(mockInitializeResponse(1));
    await client.initialize();

    const closeSpy = vi.spyOn(mock.stdin as { close: () => void }, 'close');

    // close() should close stdin.
    await client.close(100);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
```

### Implementation Requirements

1. **Create `tests/server/acp-client.test.ts`** with the exact 9 tests shown above. Adjust import paths if the project uses path aliases, but keep the test logic identical.

2. **Update `tests/fixtures/acp-messages.ts`** to add the `createMockStdio` function and all mock response factories shown above. If the file already has content from Story 0, append to it -- do not remove existing exports.

3. **Verify `server/acp/acp-client.ts`** has the class skeleton shown above. If Story 0 created a different stub shape, update it to match the interface. All methods except `canLoadSession` should throw `NotImplementedError`. The constructor should store `stdin` and `stdout` and must NOT throw.

**Important constructor note:** The tests need to instantiate `AcpClient(mock.stdin, mock.stdout)` in `beforeEach`. If the constructor throws, every test fails before reaching the method under test. Therefore, the constructor should NOT throw. Instead, it should store the stdin/stdout references. The `NotImplementedError` should be thrown only in the methods (`initialize`, `sessionNew`, etc.).

## Constraints

- Do NOT implement any AcpClient methods (that is prompt 2a.2)
- Do NOT modify files outside the specified list
- Do NOT create WebSocket or browser-related code
- Use `server/acp/acp-types.ts` as-is from Story 0. If any types listed in this prompt are missing, add them and note the addition.
- Use Vitest (`import { ... } from 'vitest'`) for all tests
- Use Vitest mock APIs (`vi.fn()`, `vi.mock()`, `vi.spyOn()`) for mocks/spies
- Use exact type names from the tech design

## If Blocked or Uncertain

- If `tests/fixtures/acp-messages.ts` does not exist yet, create it with the full content shown
- If the mock stdio approach needs adjustment for Bun's stream types, adapt the mock but preserve the test logic
- Resolve straightforward inconsistencies with feature spec + tech design and continue; ask only for hard blockers.

## Verification

Run:
```bash
bunx vitest run tests/server/acp-client.test.ts
```

**Expected output:** 9 tests run; new Story 2a assertions fail meaningfully against the current skeleton (exact error shape may vary).

Run:
```bash
bun run test
```

**Expected output:** Prior Story 1 tests still passing (if Story 1 is present); 9 new Story 2a tests failing (against unimplemented stubs).

Run:
```bash
bun run typecheck
```

**Expected output:** Zero type errors.

## Done When

- [ ] `tests/server/acp-client.test.ts` exists with 9 tests
- [ ] `tests/fixtures/acp-messages.ts` has `createMockStdio` and all mock factories
- [ ] `server/acp/acp-client.ts` has the class skeleton (constructor does NOT throw, methods throw NotImplementedError)
- [ ] `bun run typecheck` passes
- [ ] `bunx vitest run tests/server/acp-client.test.ts` runs 9 tests with failing outcomes attributable to unimplemented Story 2a behavior
- [ ] `bun run test` shows prior tests passing (if present) and 9 new tests failing
