# Prompt 2b.2: Green (Agent Manager Implementation)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs (Claude Code, Codex). The server manages CLI agent processes via the ACP (Agent Client Protocol). Each CLI type (claude-code, codex) runs as a single child process, spawned on demand and monitored for health.

Story 2a implemented the `AcpClient` (JSON-RPC protocol layer). Story 2b builds the `AgentManager` on top of it -- the process lifecycle layer. In prompt 2b.1, 10 tests were written and are currently failing. This prompt implements the full `AgentManager` class to make all 10 tests pass.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `server/acp/agent-manager.ts` -- class skeleton with stubs (from prompt 2b.1)
- `tests/server/agent-manager.test.ts` -- 10 failing tests (from prompt 2b.1)
- `server/acp/acp-client.ts` -- fully implemented AcpClient (from Story 2a)
- `server/acp/acp-types.ts` -- protocol types (from Story 0)
- `server/sessions/session-types.ts` -- CliType (from Story 0)
- 17 tests passing (Story 1 + 2a), 10 failing (Story 2b)

## Reference Documents
(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Agent Lifecycle State Machine, AgentManager interface, Flow 5, Error Contracts)
- Feature Spec: `docs/feature-spec-mvp.md` (AC-5.1, AC-5.3, AC-5.5, Flow 5)

## Task

### Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `server/acp/agent-manager.ts` | **Implement** | Replace all stubs with full implementation |

No other files should be modified.

### Agent Lifecycle State Machine

```
[*] --> idle
idle --> starting : spawn (ensureAgent called)
starting --> connected : ACP handshake succeeds
starting --> disconnected : process fails to start OR handshake fails
connected --> disconnected : process exits / crashes
disconnected --> reconnecting : auto-retry triggered (attempts <= 5)
reconnecting --> connected : restart succeeds
reconnecting --> disconnected : retry fails, attempts > 5
disconnected --> reconnecting : manual reconnect (resets attempt counter)
disconnected --> starting : next ensureAgent/reconnect attempt
```

**State transition table:**

| From | Trigger | To | Action | Emits |
|------|---------|----|----|-------|
| idle | `ensureAgent()` called | starting | Spawn process, create AcpClient | `agent:status { cliType, status: 'starting' }` |
| starting | `client.initialize()` succeeds | connected | Store client reference | `agent:status { cliType, status: 'connected' }` |
| starting | Spawn ENOENT | disconnected | Set status to disconnected | `error { cliType, message: "Could not start [name]. Check that it's installed." }` |
| starting | `client.initialize()` rejects | disconnected | Kill process, set status | `error { cliType, message: "Could not connect to [name]" }` |
| connected | `proc.exited` resolves | disconnected | Clear client, begin auto-retry | `agent:status { cliType, status: 'disconnected' }` |
| disconnected | Auto-retry (attempts <= 5) | reconnecting | Schedule retry with backoff | `agent:status { cliType, status: 'reconnecting' }` |
| reconnecting | Spawn + init succeeds | connected | Store new client, reset attempts | `agent:status { cliType, status: 'connected' }` |
| reconnecting | Spawn + init fails, attempts > 5 | disconnected | Stop retrying | `agent:status { cliType, status: 'disconnected' }` |
| disconnected | `reconnect()` called (manual) | reconnecting | Reset attempts, spawn | `agent:status { cliType, status: 'reconnecting' }` |

### Type Definitions

```typescript
// server/sessions/session-types.ts (DO NOT MODIFY)
export type CliType = 'claude-code' | 'codex';
```

```typescript
// server/acp/agent-manager.ts -- types to export

export type AgentStatus = 'idle' | 'starting' | 'connected' | 'disconnected' | 'reconnecting';

export interface AgentState {
  status: AgentStatus;
  process: any | null;
  client: AcpClient | null;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}
```

### ACP Adapter Commands

```typescript
const ACP_COMMANDS: Record<CliType, { cmd: string; args: string[]; displayName: string }> = {
  'claude-code': { cmd: 'claude-code-acp', args: [], displayName: 'Claude Code' },
  'codex': { cmd: 'codex-acp', args: [], displayName: 'Codex' },
};
```

### Dependency Injection Interface

```typescript
export interface AgentManagerDeps {
  spawn: (cmd: string[], opts: any) => any;
  createClient: (stdin: any, stdout: any) => AcpClient;
}

const DEFAULT_DEPS: AgentManagerDeps = {
  spawn: (cmd, opts) => Bun.spawn(cmd, opts),
  createClient: (stdin, stdout) => new AcpClient(stdin, stdout),
};
```

### Implementation Requirements

Implement `server/acp/agent-manager.ts` with the following logic:

#### 1. Constructor

```typescript
constructor(emitter: EventEmitter, deps?: Partial<AgentManagerDeps>) {
  this.emitter = emitter;
  this.deps = { ...DEFAULT_DEPS, ...deps };

  // Initialize both CLI types to idle
  this.agents.set('claude-code', {
    status: 'idle',
    process: null,
    client: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
  });
  this.agents.set('codex', {
    status: 'idle',
    process: null,
    client: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
  });
}
```

#### 2. `ensureAgent(cliType)`

```
1. Get agent state for cliType
2. If status is 'connected' and client exists:
   - Return existing client (reuse -- TC-5.1b)
3. If status is 'idle' or 'disconnected':
   - Call spawnAgent(cliType)
   - Return new client
4. If status is 'starting' or 'reconnecting':
   - Return the in-flight spawn promise for this cliType (do not spawn again)
```

#### 3. `spawnAgent(cliType)` (private)

```
1. Set status to 'starting'
2. Emit 'agent:status' { cliType, status: 'starting' }
3. Look up command from ACP_COMMANDS
4. Try:
   a. Spawn process: deps.spawn([cmd, ...args], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })
   b. Create client: deps.createClient(proc.stdin, proc.stdout)
   c. await client.initialize()
   d. Set status to 'connected', store process and client, reset reconnectAttempts to 0
   e. Emit 'agent:status' { cliType, status: 'connected' }
   f. Monitor process exit: proc.exited.then(code => onProcessExit(cliType, code))
   g. Register client error handler
   h. Return client
5. Catch spawn error:
   a. If error is ENOENT (or message contains 'ENOENT'):
      - Set status to 'disconnected'
      - Emit 'error' { cliType, message: "Could not start [displayName]. Check that it's installed." }
      - Throw error with same message
   b. If error is handshake failure (initialize rejects):
      - Kill spawned process if it exists
      - Set status to 'disconnected'
      - Emit 'error' { cliType, message: "Could not connect to [displayName]" }
      - Throw error with same message
```

#### 4. `onProcessExit(cliType, code)` (private)

```
1. Get agent state
2. If status is already 'idle' or shutting down, ignore
3. Clear process and client references
4. Set status to 'disconnected'
5. Emit 'agent:status' { cliType, status: 'disconnected' }
6. If reconnectAttempts < 5:
   - Increment reconnectAttempts
   - Schedule auto-retry with exponential backoff
```

#### 5. Exponential Backoff Reconnection

```
Backoff schedule: 1s, 2s, 4s, 8s, 16s (cap at 30s)
Formula: Math.min(1000 * 2^(attempt-1), 30000)

autoReconnect(cliType):
  1. Set status to 'reconnecting'
  2. Emit 'agent:status' { cliType, status: 'reconnecting' }
  3. Calculate delay from backoff formula
  4. Set reconnectTimer = setTimeout(() => {
       try spawnAgent(cliType)
       catch: if attempts > 5, stay disconnected
     }, delay)
```

#### 6. `reconnect(cliType)` (manual)

```
1. Cancel any pending auto-retry timer
2. Reset reconnectAttempts to 0
3. Call spawnAgent(cliType)
```

#### 7. `getStatus(cliType)`

```
Return this.agents.get(cliType)?.status ?? 'idle'
```

#### 8. `shutdownAll()`

```
1. Set a shutting-down flag to prevent reconnection
2. Cancel all reconnect timers
3. For each agent with a process:
   a. Close client (client.close(5000))
   b. Wait for process exit with 5-second timeout
   c. If still running after 5s, proc.kill('SIGKILL')
   d. Set status to 'idle'
4. Wait for all shutdown operations to complete (Promise.all)
```

### Complete Implementation Template

```typescript
// server/acp/agent-manager.ts

import { EventEmitter } from 'events';
import type { CliType } from '../sessions/session-types';
import { AcpClient } from './acp-client';

export type AgentStatus = 'idle' | 'starting' | 'connected' | 'disconnected' | 'reconnecting';

export interface AgentState {
  status: AgentStatus;
  process: any | null;
  client: AcpClient | null;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

export interface AgentManagerDeps {
  spawn: (cmd: string[], opts: any) => any;
  createClient: (stdin: any, stdout: any) => AcpClient;
}

const ACP_COMMANDS: Record<CliType, { cmd: string; args: string[]; displayName: string }> = {
  'claude-code': { cmd: 'claude-code-acp', args: [], displayName: 'Claude Code' },
  'codex': { cmd: 'codex-acp', args: [], displayName: 'Codex' },
};

const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 30000;

const DEFAULT_DEPS: AgentManagerDeps = {
  spawn: (cmd, opts) => Bun.spawn(cmd, opts),
  createClient: (stdin, stdout) => new AcpClient(stdin, stdout),
};

export class AgentManager {
  private agents = new Map<CliType, AgentState>();
  private emitter: EventEmitter;
  private deps: AgentManagerDeps;
  private shuttingDown = false;
  private spawnInFlight = new Map<CliType, Promise<AcpClient>>();

  constructor(emitter: EventEmitter, deps?: Partial<AgentManagerDeps>) {
    this.emitter = emitter;
    this.deps = { ...DEFAULT_DEPS, ...deps };

    // Initialize both CLI types to idle
    for (const cliType of ['claude-code', 'codex'] as CliType[]) {
      this.agents.set(cliType, {
        status: 'idle',
        process: null,
        client: null,
        reconnectAttempts: 0,
        reconnectTimer: null,
      });
    }
  }

  async ensureAgent(cliType: CliType): Promise<AcpClient> {
    const state = this.agents.get(cliType)!;

    // If already connected, reuse
    if (state.status === 'connected' && state.client) {
      return state.client;
    }

    // Reuse in-flight spawn/reconnect to avoid duplicate process races
    const existing = this.spawnInFlight.get(cliType);
    if (existing) {
      return existing;
    }

    const spawnPromise = this.spawnAgent(cliType).finally(() => {
      this.spawnInFlight.delete(cliType);
    });
    this.spawnInFlight.set(cliType, spawnPromise);
    return spawnPromise;
  }

  getStatus(cliType: CliType): AgentStatus {
    return this.agents.get(cliType)?.status ?? 'idle';
  }

  async reconnect(cliType: CliType): Promise<void> {
    const state = this.agents.get(cliType)!;

    // Cancel pending auto-retry
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }

    // Reset attempts for manual reconnect
    state.reconnectAttempts = 0;

    const existing = this.spawnInFlight.get(cliType);
    if (existing) {
      await existing;
      return;
    }

    const spawnPromise = this.spawnAgent(cliType).finally(() => {
      this.spawnInFlight.delete(cliType);
    });
    this.spawnInFlight.set(cliType, spawnPromise);
    await spawnPromise;
  }

  async shutdownAll(): Promise<void> {
    this.shuttingDown = true;

    const shutdownPromises: Promise<void>[] = [];

    for (const [cliType, state] of this.agents) {
      // Cancel any reconnect timer
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }

      if (state.client) {
        shutdownPromises.push(
          this.shutdownAgent(cliType, state)
        );
      }
    }

    await Promise.all(shutdownPromises);
  }

  // --- Private methods ---

  private async spawnAgent(cliType: CliType): Promise<AcpClient> {
    const state = this.agents.get(cliType)!;
    const cmdConfig = ACP_COMMANDS[cliType];

    // Transition: -> starting
    state.status = 'starting';
    this.emitter.emit('agent:status', { cliType, status: 'starting' });

    let proc: any;
    try {
      proc = this.deps.spawn(
        [cmdConfig.cmd, ...cmdConfig.args],
        { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }
      );
    } catch (err: any) {
      // ENOENT -- CLI not installed
      state.status = 'disconnected';
      const message = `Could not start ${cmdConfig.displayName}. Check that it's installed.`;
      this.emitter.emit('error', { cliType, message });
      throw new Error(message);
    }

    // Create AcpClient
    const client = this.deps.createClient(proc.stdin, proc.stdout);
    client.onError((err: Error) => {
      // Handle client-level errors (broken pipe, parse errors)
      if (!this.shuttingDown) {
        this.onProcessExit(cliType, 1);
      }
    });

    try {
      await client.initialize();
    } catch (err: any) {
      // Handshake failure
      state.status = 'disconnected';
      try { proc.kill?.(); } catch {}
      const message = `Could not connect to ${cmdConfig.displayName}`;
      this.emitter.emit('error', { cliType, message });
      throw new Error(message);
    }

    // Transition: -> connected
    state.status = 'connected';
    state.process = proc;
    state.client = client;
    state.reconnectAttempts = 0;
    this.emitter.emit('agent:status', { cliType, status: 'connected' });

    // Monitor for unexpected exit
    if (proc.exited && typeof proc.exited.then === 'function') {
      proc.exited.then((code: number) => {
        if (!this.shuttingDown) {
          this.onProcessExit(cliType, code);
        }
      });
    }

    return client;
  }

  private onProcessExit(cliType: CliType, code: number): void {
    const state = this.agents.get(cliType)!;

    // Ignore if already idle or shutting down
    if (state.status === 'idle' || this.shuttingDown) return;

    // Clear references
    state.process = null;
    state.client = null;

    // Transition: -> disconnected
    state.status = 'disconnected';
    this.emitter.emit('agent:status', { cliType, status: 'disconnected' });

    // Auto-retry if under limit
    if (state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.scheduleReconnect(cliType);
    }
  }

  private scheduleReconnect(cliType: CliType): void {
    const state = this.agents.get(cliType)!;
    state.reconnectAttempts++;

    const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts - 1), MAX_BACKOFF_MS);

    // Transition: -> reconnecting
    state.status = 'reconnecting';
    this.emitter.emit('agent:status', { cliType, status: 'reconnecting' });

    state.reconnectTimer = setTimeout(async () => {
      state.reconnectTimer = null;
      try {
        await this.spawnAgent(cliType);
      } catch {
        // If reconnect fails and we've exceeded max attempts, stay disconnected
        if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          state.status = 'disconnected';
          this.emitter.emit('agent:status', { cliType, status: 'disconnected' });
        } else {
          // Schedule another retry
          this.scheduleReconnect(cliType);
        }
      }
    }, delay);
  }

  private async shutdownAgent(cliType: CliType, state: AgentState): Promise<void> {
    try {
      if (state.client) {
        await state.client.close(5000);
      }
    } catch {
      // Force kill if graceful close fails
      try {
        state.process?.kill?.('SIGKILL');
      } catch {}
    }

    state.status = 'idle';
    state.process = null;
    state.client = null;
    state.reconnectAttempts = 0;
  }
}
```

## Constraints

- Only modify `server/acp/agent-manager.ts`
- Prefer not to modify tests; if a Red test has a clear invalid assumption, make the smallest fix that preserves TC intent and document it.
- Do NOT modify `server/acp/acp-client.ts`, `server/acp/acp-types.ts`, or `shared/types.ts`
- Do NOT create any WebSocket handler code
- Do NOT implement beyond AgentManager scope
- The implementation must work with the mock dependency injection from the tests
- Use `EventEmitter` from Node's `events` module (available in Bun)

## If Blocked or Uncertain

- If tests expect a different behavior than described here, the tests are the source of truth -- match what the tests assert
- If the mock dependency injection pattern from the tests requires a different constructor signature, adapt the implementation
- If auto-reconnect timing causes test flakiness, the tests should mock or control timing; do not add artificial delays to the implementation
- Resolve normal inconsistencies using feature spec + tech design and proceed; ask only on hard blockers.

## Verification

Run:
```bash
bun test tests/server/agent-manager.test.ts
```

**Expected output:** 10 tests, all PASSING.

Run:
```bash
bun test
```

**Expected output:** 27 total tests, all PASSING (9 Story 1 + 8 Story 2a + 10 Story 2b).

Run:
```bash
bun run typecheck
```

**Expected output:** Zero type errors.

## Done When

- [ ] `server/acp/agent-manager.ts` fully implemented (no more NotImplementedError)
- [ ] `bun test tests/server/agent-manager.test.ts` -- 10 tests pass
- [ ] `bun test` -- 27 total tests pass (no regressions)
- [ ] `bun run typecheck` -- zero errors
- [ ] AgentManager correctly:
  - Spawns agent on first `ensureAgent()` call (idle -> starting -> connected)
  - Reuses existing client on subsequent `ensureAgent()` calls
  - Transitions to disconnected on process exit
  - Auto-retries with exponential backoff (up to 5 attempts)
  - Manual reconnect resets attempt counter and spawns new process
  - Reports ENOENT as "Check that it's installed" error
  - Reports handshake failure as "Could not connect" error
  - Shuts down all agents gracefully (close stdin, wait, SIGKILL)
  - Emits status events via EventEmitter for all transitions
  - Agent state is independent of WebSocket connections
