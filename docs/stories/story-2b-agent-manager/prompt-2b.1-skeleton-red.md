# Prompt 2b.1: Skeleton + Red (Agent Manager Tests)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for AI coding CLIs. The stack is Bun + Fastify server with vanilla HTML/JS client, communicating via WebSocket. The server bridges browser WebSocket connections to CLI agent processes via the ACP (Agent Client Protocol), which uses JSON-RPC 2.0 over stdio.

Story 2a implemented the `AcpClient` class (JSON-RPC protocol layer over stdio). Story 2b builds on top of it: the `AgentManager` class manages the lifecycle of ACP agent processes -- spawning, monitoring, reconnection, and shutdown. Story 2b runtime scope is `claude-code` only (Codex runtime is deferred to Story 6). The manager implements a state machine: idle -> starting -> connected -> disconnected -> reconnecting.

This prompt creates Red tests/skeleton for both AgentManager lifecycle and WebSocket bridge routing. New tests should fail meaningfully against unimplemented behavior at this stage.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `server/acp/acp-client.ts` -- fully implemented AcpClient (from Story 2a)
- `server/acp/agent-manager.ts` -- AgentManager class stub (from Story 0)
- `server/acp/acp-types.ts` -- ACP protocol types (from Story 0)
- `server/sessions/session-types.ts` -- CliType (from Story 0)
- `server/errors.ts` -- NotImplementedError, AppError (from Story 0)
- Story dependency baseline: Story 0 + Story 2a complete (Story 1 may also be complete in the sequential pipeline, which commonly yields a 17-test pre-Story-2b baseline)

## Reference Documents
(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Agent Lifecycle State Machine, AgentManager interface, Flow 5, Agent Manager test mapping)
- Feature Spec: `docs/feature-spec-mvp.md` (AC-5.1, AC-5.3, AC-5.5, Flow 5)

## Task

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `tests/server/agent-manager.test.ts` | **Create** | 10 tests covering agent lifecycle |
| `server/acp/agent-manager.ts` | **Verify/Update** | Ensure class skeleton matches interface below |
| `server/websocket.ts` | **Verify/Update** | Ensure WS bridge skeleton routes through AgentManager APIs |

### Agent Lifecycle State Machine

```
stateDiagram-v2
    [*] --> idle
    idle --> starting : spawn
    starting --> connected : handshake success
    starting --> disconnected : fail
    connected --> disconnected : crash / exit
    disconnected --> reconnecting : auto-retry (<=5)
    reconnecting --> connected : success
    reconnecting --> disconnected : fail (>5, manual retry)
    disconnected --> reconnecting : manual reconnect
    disconnected --> starting : retry
```

**State transitions and WebSocket emissions:**

| From | Event | To | Emits |
|------|-------|----|-------|
| idle | Session requested | starting | `agent:status { starting }` |
| starting | ACP handshake succeeds | connected | `agent:status { connected }` |
| starting | Process fails to start | disconnected | `error { message }` |
| connected | Process exits/crashes | disconnected | `agent:status { disconnected }` |
| disconnected | Auto-retry triggered | reconnecting | `agent:status { reconnecting }` |
| reconnecting | Restart succeeds | connected | `agent:status { connected }` |
| reconnecting | Retry exhausted (>5) | disconnected | `agent:status { disconnected }` (manual retry available) |
| disconnected | Manual reconnect request | reconnecting | `agent:status { reconnecting }` |

### Type Definitions

```typescript
// server/sessions/session-types.ts (exists from Story 0)
export type CliType = 'claude-code' | 'codex';
```

For Story 2b, only `claude-code` runtime behavior is in scope. Keep the union type as-is for forward compatibility; Codex runtime tests/implementation are deferred to Story 6.

```typescript
// server/acp/agent-manager.ts -- AgentManager class and related types

import { EventEmitter } from 'events';
import type { CliType } from '../sessions/session-types';
import type { AcpClient } from './acp-client';

export type AgentStatus = 'idle' | 'starting' | 'connected' | 'disconnected' | 'reconnecting';

export interface AgentState {
  status: AgentStatus;
  process: any | null;       // Bun.spawn result (ChildProcess-like)
  client: AcpClient | null;
  reconnectAttempts: number;
}

/**
 * Manages ACP agent process lifecycle for all CLI types.
 * One process per CLI type, spawned on demand, monitored for health.
 *
 * Events emitted (via EventEmitter):
 *   'agent:status' -> { cliType: CliType, status: AgentStatus }
 *   'error' -> { cliType: CliType, message: string }
 *
 * Covers: AC-5.1 (auto-start), AC-5.2 (status), AC-5.3 (shutdown),
 *         AC-5.5 (start failure)
 */
export class AgentManager {
  private agents = new Map<CliType, AgentState>();
  private emitter: EventEmitter;

  constructor(emitter: EventEmitter) {
    this.emitter = emitter;
    // Initialize Story 2b runtime state (claude-code)
    throw new NotImplementedError('AgentManager.constructor');
  }

  /** Get or spawn agent for CLI type. Emits status events.
   *  If agent is already connected, returns existing client.
   *  If agent is idle/disconnected, spawns a new process. */
  async ensureAgent(cliType: CliType): Promise<AcpClient> {
    throw new NotImplementedError('AgentManager.ensureAgent');
  }

  /** Get current status for a CLI type */
  getStatus(cliType: CliType): AgentStatus {
    throw new NotImplementedError('AgentManager.getStatus');
  }

  /** User-initiated reconnect (from clicking Reconnect button) */
  async reconnect(cliType: CliType): Promise<void> {
    throw new NotImplementedError('AgentManager.reconnect');
  }

  /** Shutdown all agents gracefully:
   *  1. Close stdin for each process
   *  2. Wait up to 5 seconds for clean exit
   *  3. SIGKILL if still running */
  async shutdownAll(): Promise<void> {
    throw new NotImplementedError('AgentManager.shutdownAll');
  }
}
```

### AcpClient Interface (from Story 2a -- for reference in tests)

```typescript
// server/acp/acp-client.ts (fully implemented, DO NOT MODIFY)

export class AcpClient {
  constructor(stdin: any, stdout: any);
  async initialize(): Promise<AcpInitializeResult>;
  async sessionNew(params: { cwd: string }): Promise<AcpCreateResult>;
  async sessionLoad(sessionId: string, cwd: string): Promise<ChatEntry[]>;
  async sessionPrompt(sessionId: string, content: string, onEvent: Function): Promise<AcpPromptResult>;
  sessionCancel(sessionId: string): void;
  async close(timeoutMs?: number): Promise<void>;
  onError(handler: (error: Error) => void): void;
  get canLoadSession(): boolean;
}
```

### ACP Adapter Commands

```typescript
// These are the commands used to spawn ACP agent processes
// (AppError comes from server/errors.ts)
const ACP_COMMANDS: Partial<Record<CliType, { cmd: string; args: string[] }>> = {
  'claude-code': { cmd: 'claude-code-acp', args: [] },
  // codex runtime entry is deferred to Story 6
};

const command = ACP_COMMANDS[cliType];
if (!command) {
  throw new AppError('UNSUPPORTED_CLI', `CLI type not yet supported in Story 2b: ${cliType}`);
}
```

### Test File

Create `tests/server/agent-manager.test.ts` with 10 tests. Tests mock `Bun.spawn` and `AcpClient` to avoid requiring real CLI binaries.

**Mocking strategy:**
- Mock `Bun.spawn` to return a fake process object (with stdin, stdout, stderr, exited promise, kill method)
- Mock `AcpClient` constructor and methods to control initialization success/failure
- Use the EventEmitter to capture emitted status events

```typescript
// tests/server/agent-manager.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { AgentManager, type AgentStatus } from '../../server/acp/agent-manager';
import { AcpClient } from '../../server/acp/acp-client';

const mock = vi.fn;

// --- Mock Helpers ---

interface MockProcess {
  stdin: { write: Function; close: Function };
  stdout: AsyncIterable<string>;
  stderr: AsyncIterable<string>;
  pid: number;
  exited: Promise<number>;
  kill: Function;
  _resolveExit: (code: number) => void;
}

function createMockProcess(pid = 1234): MockProcess {
  let resolveExit: (code: number) => void;
  const exited = new Promise<number>((resolve) => { resolveExit = resolve; });

  return {
    stdin: { write: mock(() => {}), close: mock(() => {}) },
    stdout: { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) } as any,
    stderr: { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) } as any,
    pid,
    exited,
    kill: mock(() => {}),
    _resolveExit: resolveExit!,
  };
}

/**
 * Collect events emitted by the EventEmitter.
 * Returns an array of { event, args } objects.
 */
function collectEvents(emitter: EventEmitter): Array<{ event: string; args: any[] }> {
  const events: Array<{ event: string; args: any[] }> = [];
  const originalEmit = emitter.emit.bind(emitter);
  emitter.emit = (event: string, ...args: any[]) => {
    events.push({ event, args });
    return originalEmit(event, ...args);
  };
  return events;
}

describe('AgentManager', () => {
  let emitter: EventEmitter;
  let manager: AgentManager;
  let events: Array<{ event: string; args: any[] }>;
  let mockSpawn: ReturnType<typeof mock>;
  let mockAcpInitialize: ReturnType<typeof mock>;

  beforeEach(() => {
    emitter = new EventEmitter();
    events = collectEvents(emitter);

    // Mock Bun.spawn to return a fake process
    const proc = createMockProcess();
    mockSpawn = mock(() => proc);

    // Mock AcpClient.prototype.initialize to resolve successfully
    mockAcpInitialize = mock(() => Promise.resolve({
      protocolVersion: 1,
      agentInfo: { name: 'mock', title: 'Mock', version: '1.0' },
      agentCapabilities: { loadSession: true },
    }));

    // Apply mocks -- the AgentManager implementation should use injectable
    // spawn and AcpClient factories, or we mock at the module level.
    // The exact mocking mechanism depends on implementation. For now,
    // we set up the manager with the mocks.
    manager = new AgentManager(emitter, {
      spawn: mockSpawn,
      createClient: (stdin: any, stdout: any) => {
        const client = Object.create(AcpClient.prototype);
        client.initialize = mockAcpInitialize;
        client.close = mock(() => Promise.resolve());
        client.onError = mock(() => {});
        client.sessionNew = mock(() => Promise.resolve({ sessionId: 'test-session' }));
        return client;
      },
    });
  });

  it('TC-5.1a: first session spawns agent', async () => {
    // Given: No process running for claude-code
    expect(manager.getStatus('claude-code')).toBe('idle');

    // When: First session triggers agent
    const client = await manager.ensureAgent('claude-code');

    // Then: Process spawned, client initialized, status connected
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockAcpInitialize).toHaveBeenCalledTimes(1);
    expect(client).toBeTruthy();
    expect(manager.getStatus('claude-code')).toBe('connected');

    // Verify status events emitted: starting -> connected
    const statusEvents = events.filter(e => e.event === 'agent:status');
    expect(statusEvents).toHaveLength(2);
    expect(statusEvents[0].args[0]).toMatchObject({ cliType: 'claude-code', status: 'starting' });
    expect(statusEvents[1].args[0]).toMatchObject({ cliType: 'claude-code', status: 'connected' });
  });

  it('TC-5.1b: second session reuses process', async () => {
    // Given: Process already running
    await manager.ensureAgent('claude-code');
    const spawnCallCount = mockSpawn.mock.calls.length;

    // When: Another session requested
    const client = await manager.ensureAgent('claude-code');

    // Then: No new spawn, same client returned
    expect(mockSpawn.mock.calls.length).toBe(spawnCallCount);
    expect(client).toBeTruthy();
    expect(manager.getStatus('claude-code')).toBe('connected');
  });

  it('TC-5.2a: connected status after init', async () => {
    // Given: Agent initialized
    await manager.ensureAgent('claude-code');

    // Then: Status is 'connected'
    expect(manager.getStatus('claude-code')).toBe('connected');
  });

  it('TC-5.2b: disconnected on process exit', async () => {
    // Given: Agent running
    const proc = createMockProcess();
    mockSpawn.mockImplementation(() => proc);
    await manager.ensureAgent('claude-code');
    events.length = 0; // Clear previous events

    // When: Process exits unexpectedly
    proc._resolveExit(1);
    // Wait for the exit handler to fire
    await new Promise(resolve => setTimeout(resolve, 50));

    // Then: Status is 'disconnected', event emitted
    expect(manager.getStatus('claude-code')).toBe('disconnected');
    const statusEvents = events.filter(e => e.event === 'agent:status');
    expect(statusEvents.some(e => e.args[0]?.status === 'disconnected')).toBe(true);
  });

  it('TC-5.2c: reconnecting on auto-retry', async () => {
    // Given: Agent running then crashes
    const proc = createMockProcess();
    mockSpawn.mockImplementation(() => proc);
    await manager.ensureAgent('claude-code');
    events.length = 0;

    // When: Process exits, auto-retry begins
    proc._resolveExit(1);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Then: Status transitions to 'reconnecting' (auto-retry kicks in)
    // The manager should automatically attempt reconnection
    const statusEvents = events.filter(e => e.event === 'agent:status');
    const hasReconnecting = statusEvents.some(e => e.args[0]?.status === 'reconnecting');
    const hasDisconnected = statusEvents.some(e => e.args[0]?.status === 'disconnected');

    // Either disconnected then reconnecting, or just reconnecting
    expect(hasDisconnected || hasReconnecting).toBe(true);
  });

  it('TC-5.2d: manual reconnect spawns new', async () => {
    // Given: Agent is disconnected
    const proc = createMockProcess();
    mockSpawn.mockImplementation(() => proc);
    await manager.ensureAgent('claude-code');

    // Simulate disconnection
    proc._resolveExit(1);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Prepare new process for reconnect
    const newProc = createMockProcess(5678);
    mockSpawn.mockImplementation(() => newProc);
    events.length = 0;

    // When: Manual reconnect requested
    await manager.reconnect('claude-code');

    // Then: New process spawned, status connected
    expect(manager.getStatus('claude-code')).toBe('connected');
    const statusEvents = events.filter(e => e.event === 'agent:status');
    expect(statusEvents.some(e => e.args[0]?.status === 'connected')).toBe(true);
  });

  it('TC-5.3a: shutdown terminates all', async () => {
    // Given: claude-code agent running
    const proc = createMockProcess(1111);
    mockSpawn.mockImplementation(() => proc);

    await manager.ensureAgent('claude-code');

    // When: shutdownAll called
    // Make process exit when stdin is closed
    proc.stdin.close = mock(() => { proc._resolveExit(0); });

    await manager.shutdownAll();

    // Then: Process stdin closed (shutdown signal)
    expect(proc.stdin.close).toHaveBeenCalled();
  });

  it('TC-5.5a: ENOENT shows install message', async () => {
    // Given: Spawn fails with ENOENT (CLI not installed)
    mockSpawn.mockImplementation(() => {
      const err = new Error('spawn claude-code-acp ENOENT') as any;
      err.code = 'ENOENT';
      throw err;
    });

    // When: Agent requested
    // Then: Error emitted with install message
    try {
      await manager.ensureAgent('claude-code');
      expect(true).toBe(false); // Should not reach here
    } catch (err: any) {
      expect(err.message).toContain("Check that it's installed");
    }

    // Also verify error event was emitted
    const errorEvents = events.filter(e => e.event === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0].args[0].message).toContain("Check that it's installed");
  });

  it('TC-5.5b: handshake failure shows connect error', async () => {
    // Given: Spawn succeeds but initialize fails
    mockAcpInitialize.mockImplementation(() =>
      Promise.reject(new Error('Protocol version mismatch'))
    );

    // When: Agent requested
    try {
      await manager.ensureAgent('claude-code');
      expect(true).toBe(false); // Should not reach here
    } catch (err: any) {
      expect(err.message).toContain('Could not connect');
    }

    // Verify error event emitted
    const errorEvents = events.filter(e => e.event === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0].args[0].message).toContain('Could not connect');
  });

  it('TC-5.6b: agent survives WS disconnect', async () => {
    // Given: Agent running
    await manager.ensureAgent('claude-code');

    // When: WebSocket disconnects and reconnects (simulated by doing nothing --
    //        the agent manager doesn't know about WebSocket connections)
    // The point is that the agent process is managed by the server,
    // not by the browser connection.

    // Then: Agent is still available
    expect(manager.getStatus('claude-code')).toBe('connected');
    const client = await manager.ensureAgent('claude-code');
    expect(client).toBeTruthy();
    // No new spawn occurred
    // (ensureAgent returns existing client without spawning)
  });
});
```

### Implementation Requirements

1. **Create `tests/server/agent-manager.test.ts`** with the exact 10 tests shown above. The tests use mock factories and spies to simulate process spawning.

2. **Update `server/acp/agent-manager.ts`** skeleton to support dependency injection for testability. The constructor should accept an optional second parameter for injectable factories:

```typescript
interface AgentManagerDeps {
  spawn: (cmd: string[], opts: any) => any;
  createClient: (stdin: any, stdout: any) => AcpClient;
}
```

This allows tests to inject mock spawn and mock AcpClient creation. The production code can default to `Bun.spawn` and `new AcpClient()`.

3. **Ensure the constructor does NOT throw** -- it should initialize Story 2b runtime state (`claude-code`) and store dependencies. Keep type compatibility for `CliType` union, but do not require Codex runtime behavior in this story. Only methods should throw `NotImplementedError`.

4. **Update the `AgentManager` export** to also export `AgentStatus` as a type.

5. **Add WebSocket bridge skeleton support** in `server/websocket.ts`:
- Route inbound WebSocket messages: `session:create`, `session:open`, `session:send`, `session:cancel`
- Verify each route calls `AgentManager.ensureAgent('claude-code')` then delegates to `AcpClient`
- Verify `AgentManager` events are forwarded to WebSocket clients:
  - `agent:status` -> outbound `agent:status`
  - `error` -> outbound `error`
- Add `requestId` pass-through assertions: when inbound messages include `requestId`, correlated responses/errors include the same `requestId`
- Story 2b does not add separate counted WS integration tests; end-to-end WS bridge test coverage is counted in Story 6 to preserve the 79-test ladder.

### Key Design Notes

- Story 2b includes WebSocket bridge work. `server/websocket.ts` is in-scope for routing and outbound agent event forwarding.
- The `AgentManager` uses an `EventEmitter` for status notifications. The WebSocket handler listens to these events and forwards them to the browser.
- Runtime behavior in Story 2b is Claude Code only. Codex runtime support is deferred to Story 6.
- The test for TC-5.2c (auto-retry) is intentionally loose -- it checks that EITHER disconnected or reconnecting status was emitted, because the timing of auto-retry depends on implementation details (immediate vs delayed).
- The test for TC-5.6b verifies that the agent manager has no coupling to WebSocket state -- it simply confirms the agent is still available after a hypothetical WS disconnect.

## Constraints

- Do NOT implement any AgentManager methods (that is prompt 2b.2)
- Do NOT modify `server/acp/acp-client.ts` -- it is complete from Story 2a
- Do NOT modify files outside the specified list
- Keep WebSocket changes limited to bridge skeletons for Story 2b routing/forwarding scope
- Use Vitest APIs (`vitest`) in tests
- Tests must mock `Bun.spawn` via dependency injection, not monkey-patching global
- Do NOT add Codex runtime tests/config in Story 2b (deferred to Story 6)

## If Blocked or Uncertain

- If the AgentManager stub from Story 0 has a different constructor signature, update it to match the injectable pattern described above
- If an existing test snippet uses Bun mock APIs, convert it to Vitest (`vi.fn`, `vi.spyOn`)
- Resolve straightforward inconsistencies with feature spec + tech design and continue; ask only for hard blockers.
- The test mocking approach (dependency injection via constructor) is preferred over module-level mocking for clarity and reliability

## Verification

Run:
```bash
bun run test -- tests/server/agent-manager.test.ts
```

**Expected output:** 10 tests run; new Story 2b assertions fail meaningfully against the current skeleton (exact error shape may vary).

Run:
```bash
bun run test
```

**Expected output:** Existing Story 1/2a tests still pass; new Story 2b red tests fail only for unimplemented AgentManager behavior.

Run:
```bash
bun run typecheck
```

**Expected output:** Zero type errors.

## Done When

- [ ] `tests/server/agent-manager.test.ts` exists with 10 tests
- [ ] `server/acp/agent-manager.ts` has class skeleton with dependency injection, constructor does NOT throw, methods throw NotImplementedError
- [ ] `server/websocket.ts` has bridge skeleton entry points for Story 2b routes/events
- [ ] `AgentStatus` type exported from agent-manager.ts
- [ ] `bun run typecheck` passes
- [ ] `bun run test -- tests/server/agent-manager.test.ts` runs with failures attributable to unimplemented Story 2b behavior
- [ ] `bun run test` preserves passing baseline outside the new Story 2b red assertions
