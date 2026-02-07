# Prompt 0.1: Infrastructure Setup

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. The stack is Bun + Fastify server, vanilla HTML/JS client (two HTML entry points: shell and portlet served as iframes), and a WebSocket bridge. The CLIs (Claude Code and Codex) communicate via the ACP protocol (JSON-RPC over stdio).

This is Story 0: Infrastructure & Project Skeleton. It creates the entire project scaffolding -- all TypeScript type definitions from the tech design, error classes, test fixtures, the JSON store implementation, the Fastify server entry with static file serving and WebSocket endpoint, all client HTML/JS/CSS stubs, and configuration files. There are NO tests in this story. All non-infrastructure methods should throw `NotImplementedError` -- they will be implemented in later stories.

The JSON store (`json-store.ts`) IS fully implemented in this story because it is foundational infrastructure that Story 1 depends on immediately.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- Bun runtime installed
- Empty working directory (no existing `server/`, `client/`, `tests/`, or `shared/` directories)

## Reference Documents
(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Storage Design, Module Architecture, Low Altitude sections)
- Feature Spec: `docs/feature-spec-mvp.md` (Data Contracts section)

## Task

### Files to Create

**Config files (project root):**
- `package.json` -- dependencies, scripts
- `tsconfig.json` -- Bun TypeScript configuration

**Server files:**
- `server/errors.ts` -- Error classes
- `server/store/store-types.ts` -- Store config types
- `server/store/json-store.ts` -- Generic JSON persistence (FULL implementation)
- `server/projects/project-types.ts` -- Project interface
- `server/projects/project-store.ts` -- ProjectStore class (stubs)
- `server/sessions/session-types.ts` -- Session types
- `server/sessions/session-manager.ts` -- SessionManager class (stubs)
- `server/acp/acp-types.ts` -- ACP protocol types
- `server/acp/acp-client.ts` -- AcpClient class (stubs)
- `server/acp/agent-manager.ts` -- AgentManager class (stubs)
- `server/websocket.ts` -- WebSocket handler (stub)
- `server/index.ts` -- Fastify entry point

**Shared types:**
- `shared/types.ts` -- ChatEntry, ClientMessage, ServerMessage

**Client files:**
- `client/shell/index.html` -- Shell page
- `client/shell/shell.js` -- WebSocket connection
- `client/shell/sidebar.js` -- Sidebar stub
- `client/shell/tabs.js` -- Tabs stub
- `client/shell/shell.css` -- Layout styles
- `client/portlet/index.html` -- Portlet page
- `client/portlet/portlet.js` -- postMessage stub
- `client/portlet/chat.js` -- Chat render stub
- `client/portlet/input.js` -- Input bar stub
- `client/portlet/portlet.css` -- Chat + input styles
- `client/shared/theme.css` -- Tokyo Night CSS custom properties
- `client/shared/markdown.js` -- marked + DOMPurify setup
- `client/shared/constants.js` -- CLI types, status values

**Test fixtures:**
- `tests/fixtures/projects.ts` -- Mock project data
- `tests/fixtures/sessions.ts` -- Mock session data
- `tests/fixtures/acp-messages.ts` -- Mock ACP responses

### Implementation Requirements

---

#### 1. `package.json`

```json
{
  "name": "liminal-builder",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch server/index.ts",
    "start": "bun run server/index.ts",
    "typecheck": "tsc --noEmit",
    "typescheck": "bun run typecheck",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "lint": "biome lint --error-on-warnings .",
    "lint:fix": "biome lint --write --error-on-warnings .",
    "build:eslint-plugin": "tsc -p tools/eslint-plugin-lb/tsconfig.json",
    "lint:eslint": "bun run build:eslint-plugin && eslint --max-warnings 0 server shared tests",
    "lint:eslint:fix": "bun run build:eslint-plugin && eslint --max-warnings 0 --fix server shared tests",
    "test:eslint-plugin": "vitest run tools/eslint-plugin-lb/tests --passWithNoTests",
    "test": "vitest run tests/server --passWithNoTests",
    "test:client": "vitest run tests/client --passWithNoTests",
    "test:integration": "vitest run tests/integration --passWithNoTests",
    "test:e2e": "echo \"No e2e tests configured yet\"",
    "verify": "bun run format:check && bun run lint && bun run lint:eslint && bun run test:eslint-plugin && bun run typecheck && bun run test",
    "verify-all": "bun run verify && bun run test:client && bun run test:integration && bun run test:e2e"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/websocket": "^11.0.0",
    "@fastify/static": "^8.0.0",
    "marked": "^15.0.0",
    "dompurify": "^3.2.0",
    "highlight.js": "^11.11.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.3.14",
    "typescript": "^5.7.0",
    "@types/bun": "latest",
    "@types/dompurify": "^3.2.0",
    "@vitest/coverage-v8": "^4.0.18",
    "jsdom": "^28.0.0",
    "vitest": "^4.0.18"
  }
}
```

---

#### 2. `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "./dist",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@server/*": ["./server/*"],
      "@shared/*": ["./shared/*"],
      "@tests/*": ["./tests/*"]
    }
  },
  "include": ["server/**/*.ts", "shared/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist", "client"]
}
```

---

#### 3. `server/errors.ts`

```typescript
/**
 * Thrown by stub methods that are not yet implemented.
 * Used in Story 0 scaffolding -- verification expects this error from stubs.
 */
export class NotImplementedError extends Error {
  constructor(methodName: string) {
    super(`Not implemented: ${methodName}`);
    this.name = 'NotImplementedError';
  }
}

/**
 * Application-level error with a user-facing message.
 * Used for validation errors, duplicate detection, etc.
 */
export class AppError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}
```

---

#### 4. `server/store/store-types.ts`

```typescript
export interface StoreConfig {
  /** Path to JSON file */
  filePath: string;
  /** Debounce interval for writes (ms) */
  writeDebounceMs: number;
}

export interface VersionedFile<T> {
  version: number;
  data: T;
}
```

---

#### 5. `server/store/json-store.ts` (FULL IMPLEMENTATION)

This is infrastructure -- implement it fully. It provides generic JSON file persistence with atomic writes and debouncing.

**Behavior:**
- Constructor takes a `StoreConfig` and `defaultData: T`.
- `read()`: Read the JSON file. If file doesn't exist, return `defaultData`. Parse as `VersionedFile<T>`, return `data` field.
- `write(data: T)`: Debounced write. Stores pending data, schedules a flush after `writeDebounceMs`. If another write comes before the flush, replace the pending data and reset the timer.
- `writeSync(data: T)`: Immediate write (for shutdown). Cancel any pending debounced write. Write immediately.
- Internal `flush()`: Write a `VersionedFile<T>` with `version: 1` to a temp file (same path + `.tmp`), then rename to the actual path. This is the atomic write pattern.
- Ensure the directory exists before writing (create it recursively if needed).

```typescript
import { StoreConfig, VersionedFile } from './store-types';
import { mkdir, rename, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';

export class JsonStore<T> {
  private config: StoreConfig;
  private defaultData: T;
  private pendingData: T | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: StoreConfig, defaultData: T) {
    this.config = config;
    this.defaultData = defaultData;
  }

  async read(): Promise<T> {
    try {
      const raw = await readFile(this.config.filePath, 'utf-8');
      const parsed: VersionedFile<T> = JSON.parse(raw);
      return parsed.data;
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return this.defaultData;
      }
      return this.defaultData;
    }
  }

  async write(data: T): Promise<void> {
    this.pendingData = data;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, this.config.writeDebounceMs);
  }

  async writeSync(data: T): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingData = null;
    await this.atomicWrite(data);
  }

  private async flush(): Promise<void> {
    if (this.pendingData === null) return;
    const data = this.pendingData;
    this.pendingData = null;
    this.debounceTimer = null;
    await this.atomicWrite(data);
  }

  private async atomicWrite(data: T): Promise<void> {
    const dir = dirname(this.config.filePath);
    await mkdir(dir, { recursive: true });
    const tmpPath = this.config.filePath + '.tmp';
    const versioned: VersionedFile<T> = { version: 1, data };
    await writeFile(tmpPath, JSON.stringify(versioned, null, 2), 'utf-8');
    await rename(tmpPath, this.config.filePath);
  }
}
```

---

#### 6. `server/projects/project-types.ts`

```typescript
/**
 * Represents a project directory configured in the app.
 *
 * Used by: project-store, websocket handler, sidebar
 * Supports: AC-1.1 (display), AC-1.2 (add), AC-1.3 (remove)
 */
export interface Project {
  /** UUID v4 generated on add */
  id: string;
  /** Absolute filesystem path */
  path: string;
  /** Display name derived from directory basename */
  name: string;
  /** ISO 8601 UTC -- determines sidebar display order (insertion order) */
  addedAt: string;
}
```

---

#### 7. `server/sessions/session-types.ts`

```typescript
/**
 * Local metadata for a session.
 * ACP has no session/list -- we own ALL session metadata.
 * The agent only provides conversation content (via session/load replay).
 *
 * Used by: session-manager, websocket handler
 * Supports: AC-2.1 (listing), AC-2.4 (archive), AC-2.5 (persistence)
 */
export interface SessionMeta {
  /** Canonical ID: "{cliType}:{acpSessionId}" e.g., "claude-code:abc123" */
  id: string;
  /** Parent project ID */
  projectId: string;
  /** Which CLI type owns this session */
  cliType: CliType;
  /** Hidden from sidebar when true */
  archived: boolean;
  /** Session title -- derived from first user message, or "New Session" initially */
  title: string;
  /** ISO 8601 UTC -- last message activity. Updated on send/receive (not on open). */
  lastActiveAt: string;
  /** ISO 8601 UTC -- when session was created */
  createdAt: string;
}

/** Session data for client display (derived entirely from SessionMeta) */
export interface SessionListItem {
  /** Canonical session ID */
  id: string;
  /** Session title */
  title: string;
  /** ISO 8601 UTC */
  lastActiveAt: string;
  /** CLI type */
  cliType: CliType;
}

export type CliType = 'claude-code' | 'codex';
```

---

#### 8. `server/acp/acp-types.ts`

```typescript
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
  | { type: 'current_mode_update'; currentModeId: string };

/** ACP permission request (agent -> client) */
export interface AcpPermissionRequest {
  toolCallId: string;
  title: string;
  description?: string;
}
```

---

#### 9. `shared/types.ts`

```typescript
import type { Project } from '../server/projects/project-types';
import type { CliType } from '../server/sessions/session-types';

/** Chat entry types -- the UI representation of conversation content */
export type ChatEntry =
  | { entryId: string; type: 'user'; content: string; timestamp: string }
  | { entryId: string; type: 'assistant'; content: string; timestamp: string }
  | { entryId: string; type: 'thinking'; content: string }
  | { entryId: string; type: 'tool-call'; toolCallId: string; name: string;
      status: 'running' | 'complete' | 'error'; result?: string; error?: string };

/**
 * Client -> Server WebSocket messages.
 * All messages include an optional requestId for correlating responses.
 */
export type ClientMessage = {
  requestId?: string;
} & (
  | { type: 'session:open'; sessionId: string }
  | { type: 'session:create'; projectId: string; cliType: CliType }
  | { type: 'session:send'; sessionId: string; content: string }
  | { type: 'session:cancel'; sessionId: string }
  | { type: 'session:archive'; sessionId: string }
  | { type: 'session:reconnect'; cliType: CliType }
  | { type: 'project:add'; path: string }
  | { type: 'project:remove'; projectId: string }
  | { type: 'project:list' }
  | { type: 'session:list'; projectId: string }
);

/**
 * Server -> Client WebSocket messages.
 */
export type ServerMessage =
  | { type: 'session:history'; sessionId: string; entries: ChatEntry[]; requestId?: string }
  | { type: 'session:update'; sessionId: string; entry: ChatEntry }
  | { type: 'session:chunk'; sessionId: string; entryId: string; content: string }
  | { type: 'session:complete'; sessionId: string; entryId: string }
  | { type: 'session:created'; sessionId: string; projectId: string; requestId?: string }
  | { type: 'session:cancelled'; sessionId: string; entryId: string }
  | { type: 'session:archived'; sessionId: string; requestId?: string }
  | { type: 'session:title-updated'; sessionId: string; title: string }
  | { type: 'session:list'; projectId: string; sessions: Array<{ id: string; title: string; lastActiveAt: string; cliType: CliType }> }
  | { type: 'project:added'; project: Project; requestId?: string }
  | { type: 'project:removed'; projectId: string; requestId?: string }
  | { type: 'project:list'; projects: Project[] }
  | { type: 'agent:status'; cliType: CliType; status: 'starting' | 'connected' | 'disconnected' | 'reconnecting' }
  | { type: 'error'; requestId?: string; message: string };
```

---

#### 10. `server/projects/project-store.ts` (STUBS)

All methods throw `NotImplementedError`. Will be implemented in Story 1.

```typescript
import { NotImplementedError } from '../errors';
import type { JsonStore } from '../store/json-store';
import type { Project } from './project-types';

/**
 * CRUD operations for project configuration.
 * Validates paths, detects duplicates, persists to JSON.
 *
 * Covers: AC-1.1-1.3 (project management)
 */
export class ProjectStore {
  private store: JsonStore<Project[]>;

  constructor(store: JsonStore<Project[]>) {
    this.store = store;
  }

  /** Add project. Validates path exists, checks duplicates. */
  async addProject(path: string): Promise<Project> {
    throw new NotImplementedError('ProjectStore.addProject');
  }

  /** Remove project by ID. Retains session mappings. */
  async removeProject(projectId: string): Promise<void> {
    throw new NotImplementedError('ProjectStore.removeProject');
  }

  /** List all projects in insertion order. */
  async listProjects(): Promise<Project[]> {
    throw new NotImplementedError('ProjectStore.listProjects');
  }
}
```

---

#### 11. `server/sessions/session-manager.ts` (STUBS)

All methods throw `NotImplementedError`. Will be implemented in Story 4.

```typescript
import { NotImplementedError } from '../errors';
import type { JsonStore } from '../store/json-store';
import type { SessionMeta, SessionListItem, CliType } from './session-types';
import type { ProjectStore } from '../projects/project-store';
import type { AgentManager } from '../acp/agent-manager';
import type { AcpUpdateEvent, AcpPromptResult } from '../acp/acp-types';
import type { ChatEntry } from '../../shared/types';

/**
 * Manages session metadata and coordinates with ACP agents.
 * Owns the session-to-project mapping layer AND session titles/timestamps.
 *
 * Key insight: ACP has no session/list method. We own session IDs, titles,
 * and timestamps locally. The agent only provides conversation content
 * (via session/load replay and session/prompt streaming).
 *
 * Covers: AC-2.1-2.5 (session CRUD, listing, persistence)
 */
export class SessionManager {
  private store: JsonStore<SessionMeta[]>;
  private agentManager: AgentManager;
  private projectStore: ProjectStore;

  constructor(
    store: JsonStore<SessionMeta[]>,
    agentManager: AgentManager,
    projectStore: ProjectStore
  ) {
    this.store = store;
    this.agentManager = agentManager;
    this.projectStore = projectStore;
  }

  /** Create session via ACP session/new and record local metadata. */
  async createSession(projectId: string, cliType: CliType): Promise<string> {
    throw new NotImplementedError('SessionManager.createSession');
  }

  /** Open session via ACP session/load, collect replayed history. */
  async openSession(canonicalId: string): Promise<ChatEntry[]> {
    throw new NotImplementedError('SessionManager.openSession');
  }

  /** List sessions for a project (entirely from local metadata). */
  listSessions(projectId: string): SessionListItem[] {
    throw new NotImplementedError('SessionManager.listSessions');
  }

  /** Archive a session (local operation). */
  archiveSession(canonicalId: string): void {
    throw new NotImplementedError('SessionManager.archiveSession');
  }

  /** Send message to session via ACP session/prompt. */
  async sendMessage(
    canonicalId: string,
    content: string,
    onEvent: (event: AcpUpdateEvent) => void
  ): Promise<AcpPromptResult> {
    throw new NotImplementedError('SessionManager.sendMessage');
  }

  /** Update session title. */
  updateTitle(canonicalId: string, title: string): void {
    throw new NotImplementedError('SessionManager.updateTitle');
  }

  /** Convert cliType + acpId to canonical ID. */
  static toCanonical(cliType: CliType, acpId: string): string {
    return `${cliType}:${acpId}`;
  }

  /** Parse canonical ID into cliType + acpId. */
  static fromCanonical(canonicalId: string): { cliType: CliType; acpId: string } {
    const colonIndex = canonicalId.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid canonical ID: ${canonicalId}`);
    }
    // The cliType may contain colons (e.g., "claude-code"), so we split on the LAST colon
    // Actually, cliType is "claude-code" or "codex" which use hyphens not colons.
    // So the first colon is always the delimiter.
    const cliType = canonicalId.substring(0, colonIndex) as CliType;
    const acpId = canonicalId.substring(colonIndex + 1);
    return { cliType, acpId };
  }
}
```

---

#### 12. `server/acp/acp-client.ts` (STUBS)

```typescript
import { NotImplementedError } from '../errors';
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
 * Mock boundary: Tests mock this class to simulate ACP agent behavior.
 * Covers: AC-5.1 (connection), all session operations via ACP
 */
export class AcpClient {
  constructor(
    _stdin: WritableStream,
    _stdout: ReadableStream
  ) {
    // Stubs -- no initialization needed yet
  }

  /** Send initialize handshake, negotiate capabilities. */
  async initialize(): Promise<AcpInitializeResult> {
    throw new NotImplementedError('AcpClient.initialize');
  }

  /** session/new -- Create a new session with working directory */
  async sessionNew(params: { cwd: string }): Promise<AcpCreateResult> {
    throw new NotImplementedError('AcpClient.sessionNew');
  }

  /** session/load -- Resume session. */
  async sessionLoad(sessionId: string, cwd: string): Promise<ChatEntry[]> {
    throw new NotImplementedError('AcpClient.sessionLoad');
  }

  /** session/prompt -- Send user message with streaming events. */
  async sessionPrompt(
    sessionId: string,
    content: string,
    onEvent: (event: AcpUpdateEvent) => void
  ): Promise<AcpPromptResult> {
    throw new NotImplementedError('AcpClient.sessionPrompt');
  }

  /** session/cancel -- Cancel in-progress prompt. */
  sessionCancel(sessionId: string): void {
    throw new NotImplementedError('AcpClient.sessionCancel');
  }

  /** Close stdin to signal shutdown. */
  async close(timeoutMs?: number): Promise<void> {
    throw new NotImplementedError('AcpClient.close');
  }

  /** Register handler for unexpected errors. */
  onError(handler: (error: Error) => void): void {
    throw new NotImplementedError('AcpClient.onError');
  }

  /** Whether agent supports session/load */
  get canLoadSession(): boolean {
    return false;
  }
}
```

---

#### 13. `server/acp/agent-manager.ts` (STUBS)

```typescript
import { NotImplementedError } from '../errors';
import type { CliType } from '../sessions/session-types';
import type { AcpClient } from './acp-client';
import { EventEmitter } from 'events';

export type AgentStatus = 'idle' | 'starting' | 'connected' | 'disconnected' | 'reconnecting';

/**
 * Manages ACP agent process lifecycle for all CLI types.
 * One process per CLI type, spawned on demand, monitored for health.
 *
 * Covers: AC-5.1 (auto-start), AC-5.2 (status), AC-5.3 (shutdown),
 *         AC-5.5 (start failure)
 */
export class AgentManager {
  private emitter: EventEmitter;

  constructor(emitter: EventEmitter) {
    this.emitter = emitter;
  }

  /** Get or spawn agent for CLI type. Emits status events. */
  async ensureAgent(cliType: CliType): Promise<AcpClient> {
    throw new NotImplementedError('AgentManager.ensureAgent');
  }

  /** Get current status for a CLI type */
  getStatus(cliType: CliType): AgentStatus {
    throw new NotImplementedError('AgentManager.getStatus');
  }

  /** User-initiated reconnect */
  async reconnect(cliType: CliType): Promise<void> {
    throw new NotImplementedError('AgentManager.reconnect');
  }

  /** Shutdown all agents gracefully */
  async shutdownAll(): Promise<void> {
    throw new NotImplementedError('AgentManager.shutdownAll');
  }
}
```

---

#### 14. `server/websocket.ts` (STUB)

The WebSocket handler receives `ClientMessage` objects, routes them to the appropriate store/manager, and sends `ServerMessage` responses back. For now, it just parses the message and logs it. Actual routing will be implemented story-by-story.

```typescript
import type { WebSocket } from '@fastify/websocket';
import type { ClientMessage, ServerMessage } from '../shared/types';

/**
 * WebSocket connection handler.
 * Routes client messages to project-store, session-manager, agent-manager.
 * Sends server messages back to the connected client.
 */
export function handleWebSocket(socket: WebSocket): void {
  console.log('[ws] Client connected');

  socket.on('message', (raw: Buffer | string) => {
    try {
      const message: ClientMessage = JSON.parse(
        typeof raw === 'string' ? raw : raw.toString('utf-8')
      );
      console.log('[ws] Received:', message.type);

      // Message routing will be implemented per-story.
      // For now, send an error response for any message.
      const response: ServerMessage = {
        type: 'error',
        requestId: message.requestId,
        message: `Handler not implemented: ${message.type}`,
      };
      socket.send(JSON.stringify(response));
    } catch (err) {
      console.error('[ws] Failed to parse message:', err);
      const response: ServerMessage = {
        type: 'error',
        message: 'Invalid message format',
      };
      socket.send(JSON.stringify(response));
    }
  });

  socket.on('close', () => {
    console.log('[ws] Client disconnected');
  });

  socket.on('error', (err: Error) => {
    console.error('[ws] Socket error:', err.message);
  });
}
```

---

#### 15. `server/index.ts`

Fastify entry point. Registers static file serving (for `client/` directory) and the WebSocket plugin. Starts listening on port 3000.

```typescript
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { join } from 'path';
import { handleWebSocket } from './websocket';

const PORT = Number(process.env.LIMINAL_PORT) || 3000;
const HOST = process.env.LIMINAL_HOST || '127.0.0.1';
const CLIENT_DIR = join(import.meta.dir, '..', 'client');

async function main() {
  const app = Fastify({ logger: true });

  // Static file serving for the client
  await app.register(fastifyStatic, {
    root: CLIENT_DIR,
    prefix: '/',
  });

  // WebSocket support
  await app.register(fastifyWebsocket);

  // WebSocket endpoint
  app.get('/ws', { websocket: true }, (socket, _req) => {
    handleWebSocket(socket);
  });

  // Start server
  await app.listen({ port: PORT, host: HOST });
  console.log(`Liminal Builder running at http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

---

#### 16. `client/shared/theme.css`

Tokyo Night color scheme as CSS custom properties.

```css
:root {
  /* Tokyo Night Storm palette */
  --bg-primary: #24283b;
  --bg-secondary: #1a1b26;
  --bg-tertiary: #292e42;
  --bg-highlight: #2f3549;

  --fg-primary: #c0caf5;
  --fg-secondary: #a9b1d6;
  --fg-muted: #565f89;
  --fg-dark: #414868;

  --accent-blue: #7aa2f7;
  --accent-cyan: #7dcfff;
  --accent-green: #9ece6a;
  --accent-yellow: #e0af68;
  --accent-orange: #ff9e64;
  --accent-red: #f7768e;
  --accent-magenta: #bb9af7;

  --border-color: #3b4261;
  --border-active: #7aa2f7;

  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;

  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--fg-primary);
  line-height: 1.5;
}
```

---

#### 17. `client/shared/constants.js`

```javascript
/** CLI type constants */
export const CLI_TYPES = {
  CLAUDE_CODE: 'claude-code',
  CODEX: 'codex',
};

/** Agent status values */
export const AGENT_STATUS = {
  IDLE: 'idle',
  STARTING: 'starting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
};

/** Chat entry types */
export const ENTRY_TYPES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  THINKING: 'thinking',
  TOOL_CALL: 'tool-call',
};

/** Tool call status */
export const TOOL_STATUS = {
  RUNNING: 'running',
  COMPLETE: 'complete',
  ERROR: 'error',
};

/** localStorage keys */
export const STORAGE_KEYS = {
  TABS: 'liminal:tabs',
  COLLAPSED: 'liminal:collapsed',
};
```

---

#### 18. `client/shared/markdown.js`

```javascript
import { marked } from '/node_modules/marked/lib/marked.esm.js';

/**
 * Render markdown string to sanitized HTML.
 * Uses marked for GFM parsing.
 * DOMPurify will be loaded from CDN in the HTML pages.
 *
 * For MVP, we skip highlight.js integration and use basic marked rendering.
 * Syntax highlighting will be added when chat rendering is implemented.
 *
 * @param {string} text - Raw markdown text
 * @returns {string} Sanitized HTML string
 */
export function renderMarkdown(text) {
  const html = marked.parse(text, { gfm: true, breaks: true });
  // DOMPurify is expected to be available globally (loaded via CDN in HTML)
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(html);
  }
  return html;
}
```

---

#### 19. `client/shell/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Liminal Builder</title>
  <link rel="stylesheet" href="/shared/theme.css">
  <link rel="stylesheet" href="/shell/shell.css">
</head>
<body>
  <div id="app" class="shell-layout">
    <aside id="sidebar" class="sidebar">
      <div class="sidebar-header">
        <h1 class="sidebar-title">Liminal Builder</h1>
      </div>
      <div id="project-list" class="project-list">
        <!-- Projects rendered by sidebar.js -->
      </div>
      <div class="sidebar-footer">
        <button id="add-project-btn" class="btn btn-primary">+ Add Project</button>
      </div>
    </aside>

    <main class="main-area">
      <nav id="tab-bar" class="tab-bar">
        <!-- Tabs rendered by tabs.js -->
      </nav>
      <div id="portlet-container" class="portlet-container">
        <!-- Portlet iframes managed by tabs.js -->
        <div id="empty-state" class="empty-state">
          <p>Open a session from the sidebar to get started.</p>
        </div>
      </div>
    </main>
  </div>

  <script type="module" src="/shell/shell.js"></script>
</body>
</html>
```

---

#### 20. `client/shell/shell.css`

```css
.shell-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  height: 100vh;
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--border-color);
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-primary);
}

.project-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-sm);
}

.sidebar-footer {
  padding: var(--space-md);
  border-top: 1px solid var(--border-color);
}

/* Main area */
.main-area {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tab-bar {
  display: flex;
  align-items: center;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  min-height: 36px;
  overflow-x: auto;
  gap: 1px;
}

.portlet-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.portlet-container iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--fg-muted);
  font-size: 14px;
}

/* Button */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  color: var(--fg-primary);
  font-size: 13px;
  cursor: pointer;
  width: 100%;
}

.btn:hover {
  background: var(--bg-highlight);
}

.btn-primary {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}
```

---

#### 21. `client/shell/shell.js`

```javascript
import { initSidebar } from './sidebar.js';
import { initTabs } from './tabs.js';

/**
 * Shell entry point.
 * Establishes WebSocket connection and initializes sidebar + tabs.
 */

/** @type {WebSocket | null} */
let ws = null;

/** @type {((msg: object) => void)[]} */
const messageHandlers = [];

/**
 * Register a handler for incoming WebSocket messages.
 * @param {(msg: object) => void} handler
 */
export function onMessage(handler) {
  messageHandlers.push(handler);
}

/**
 * Send a message to the server via WebSocket.
 * @param {object} message - ClientMessage object
 */
export function sendMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.warn('[shell] WebSocket not connected, cannot send:', message);
  }
}

/**
 * Connect to the WebSocket server.
 */
function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}/ws`;

  ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    console.log('[shell] WebSocket connected');
  });

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      messageHandlers.forEach((handler) => handler(msg));
    } catch (err) {
      console.error('[shell] Failed to parse server message:', err);
    }
  });

  ws.addEventListener('close', () => {
    console.log('[shell] WebSocket disconnected');
    // Reconnection will be implemented in a later story
  });

  ws.addEventListener('error', (err) => {
    console.error('[shell] WebSocket error:', err);
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  connect();
  initSidebar();
  initTabs();
});
```

---

#### 22. `client/shell/sidebar.js`

```javascript
/**
 * Sidebar module stub.
 * Renders project list, handles add/remove project, collapse/expand.
 * Will be implemented in Story 1.
 */

/**
 * Initialize the sidebar.
 */
export function initSidebar() {
  console.log('[sidebar] Initialized (stub)');
}
```

---

#### 23. `client/shell/tabs.js`

```javascript
/**
 * Tab bar module stub.
 * Manages tab state, open/close/switch/reorder, iframe lifecycle.
 * Will be implemented in Story 5.
 */

/**
 * Initialize the tab bar.
 */
export function initTabs() {
  console.log('[tabs] Initialized (stub)');
}
```

---

#### 24. `client/portlet/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Liminal Portlet</title>
  <link rel="stylesheet" href="/shared/theme.css">
  <link rel="stylesheet" href="/portlet/portlet.css">
</head>
<body>
  <div id="portlet" class="portlet-layout">
    <div id="chat-container" class="chat-container">
      <!-- Chat entries rendered by chat.js -->
    </div>
    <div id="input-bar" class="input-bar">
      <textarea id="message-input" class="message-input"
        placeholder="Send a message..."
        rows="1"></textarea>
      <button id="send-btn" class="btn btn-send">Send</button>
      <button id="cancel-btn" class="btn btn-cancel" hidden>Cancel</button>
    </div>
  </div>

  <script type="module" src="/portlet/portlet.js"></script>
</body>
</html>
```

---

#### 25. `client/portlet/portlet.css`

```css
.portlet-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.chat-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
}

.input-bar {
  display: flex;
  align-items: flex-end;
  gap: var(--space-sm);
  padding: var(--space-md);
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.message-input {
  flex: 1;
  resize: none;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  color: var(--fg-primary);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.4;
  max-height: 120px;
  overflow-y: auto;
}

.message-input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.btn-send,
.btn-cancel {
  padding: var(--space-sm) var(--space-lg);
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
}

.btn-send {
  background: var(--accent-blue);
  color: var(--bg-primary);
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-cancel {
  background: var(--accent-red);
  color: var(--bg-primary);
}
```

---

#### 26. `client/portlet/portlet.js`

```javascript
/**
 * Portlet entry point stub.
 * Handles postMessage communication with the shell.
 * Will be implemented in Story 3.
 */

console.log('[portlet] Initialized (stub)');
```

---

#### 27. `client/portlet/chat.js`

```javascript
/**
 * Chat rendering stub.
 * Renders chat entries (user, assistant, tool-call, thinking).
 * Will be implemented in Story 3.
 */

/**
 * Render a chat entry into the chat container.
 * @param {object} entry - ChatEntry object
 */
export function renderEntry(entry) {
  console.log('[chat] renderEntry stub:', entry.type);
}
```

---

#### 28. `client/portlet/input.js`

```javascript
/**
 * Input bar stub.
 * Manages text input, send action, disabled state.
 * Will be implemented in Story 3.
 */

/**
 * Initialize the input bar.
 * @param {(content: string) => void} onSend - Callback when user sends a message
 */
export function initInput(onSend) {
  console.log('[input] initInput stub');
}
```

---

#### 29. `tests/fixtures/projects.ts`

```typescript
import type { Project } from '../../server/projects/project-types';

/** A valid mock project for testing */
export const MOCK_PROJECT_A: Project = {
  id: 'proj-aaa-111',
  path: '/Users/test/code/project-alpha',
  name: 'project-alpha',
  addedAt: '2026-01-15T10:00:00.000Z',
};

/** A second valid mock project for testing ordering */
export const MOCK_PROJECT_B: Project = {
  id: 'proj-bbb-222',
  path: '/Users/test/code/project-beta',
  name: 'project-beta',
  addedAt: '2026-01-15T11:00:00.000Z',
};

/** A third mock project */
export const MOCK_PROJECT_C: Project = {
  id: 'proj-ccc-333',
  path: '/Users/test/code/project-gamma',
  name: 'project-gamma',
  addedAt: '2026-01-15T12:00:00.000Z',
};

/** Mock project list (insertion order) */
export const MOCK_PROJECTS: Project[] = [
  MOCK_PROJECT_A,
  MOCK_PROJECT_B,
];

/** A path that simulates a valid directory */
export const VALID_DIR_PATH = '/Users/test/code/new-project';

/** A path that simulates an invalid (nonexistent) directory */
export const INVALID_DIR_PATH = '/Users/test/code/does-not-exist';
```

---

#### 30. `tests/fixtures/sessions.ts`

```typescript
import type { SessionMeta, SessionListItem } from '../../server/sessions/session-types';

/** Mock session for project A, Claude Code */
export const MOCK_SESSION_CC_1: SessionMeta = {
  id: 'claude-code:session-001',
  projectId: 'proj-aaa-111',
  cliType: 'claude-code',
  archived: false,
  title: 'Fix authentication bug',
  lastActiveAt: '2026-01-15T14:30:00.000Z',
  createdAt: '2026-01-15T10:00:00.000Z',
};

/** Mock session for project A, Codex */
export const MOCK_SESSION_CODEX_1: SessionMeta = {
  id: 'codex:session-002',
  projectId: 'proj-aaa-111',
  cliType: 'codex',
  archived: false,
  title: 'Add unit tests',
  lastActiveAt: '2026-01-15T13:00:00.000Z',
  createdAt: '2026-01-15T11:00:00.000Z',
};

/** Mock archived session */
export const MOCK_SESSION_ARCHIVED: SessionMeta = {
  id: 'claude-code:session-003',
  projectId: 'proj-aaa-111',
  cliType: 'claude-code',
  archived: true,
  title: 'Old refactoring',
  lastActiveAt: '2026-01-14T09:00:00.000Z',
  createdAt: '2026-01-14T08:00:00.000Z',
};

/** Mock session for project B */
export const MOCK_SESSION_B: SessionMeta = {
  id: 'claude-code:session-004',
  projectId: 'proj-bbb-222',
  cliType: 'claude-code',
  archived: false,
  title: 'Setup CI pipeline',
  lastActiveAt: '2026-01-15T15:00:00.000Z',
  createdAt: '2026-01-15T12:00:00.000Z',
};

/** Session list item derived from MOCK_SESSION_CC_1 */
export const MOCK_SESSION_LIST_ITEM: SessionListItem = {
  id: 'claude-code:session-001',
  title: 'Fix authentication bug',
  lastActiveAt: '2026-01-15T14:30:00.000Z',
  cliType: 'claude-code',
};

/** All mock sessions */
export const MOCK_SESSIONS: SessionMeta[] = [
  MOCK_SESSION_CC_1,
  MOCK_SESSION_CODEX_1,
  MOCK_SESSION_ARCHIVED,
  MOCK_SESSION_B,
];
```

---

#### 31. `tests/fixtures/acp-messages.ts`

```typescript
import type {
  JsonRpcResponse,
  AcpInitializeResult,
  AcpCreateResult,
  AcpPromptResult,
  AcpUpdateEvent,
} from '../../server/acp/acp-types';

/** Mock ACP initialize response */
export const MOCK_INIT_RESULT: AcpInitializeResult = {
  protocolVersion: 1,
  agentInfo: { name: 'claude-code', title: 'Claude Code', version: '1.0.0' },
  agentCapabilities: {
    loadSession: true,
    promptCapabilities: { image: false, embeddedContext: true },
  },
};

/** Mock ACP session/new result */
export const MOCK_CREATE_RESULT: AcpCreateResult = {
  sessionId: 'acp-session-xyz',
};

/** Mock ACP session/prompt result (end_turn) */
export const MOCK_PROMPT_RESULT: AcpPromptResult = {
  stopReason: 'end_turn',
};

/** Mock agent_message_chunk event */
export const MOCK_MESSAGE_CHUNK: AcpUpdateEvent = {
  type: 'agent_message_chunk',
  content: [{ type: 'text', text: 'Hello, I can help you with that.' }],
};

/** Mock tool_call event */
export const MOCK_TOOL_CALL: AcpUpdateEvent = {
  type: 'tool_call',
  toolCallId: 'tc-001',
  title: 'Read file',
  status: 'in_progress',
  content: [{ type: 'text', text: 'Reading src/index.ts' }],
};

/** Mock tool_call_update (completed) */
export const MOCK_TOOL_CALL_UPDATE: AcpUpdateEvent = {
  type: 'tool_call_update',
  toolCallId: 'tc-001',
  status: 'completed',
  content: [{ type: 'text', text: 'File contents read successfully' }],
};

/** Mock thought chunk */
export const MOCK_THOUGHT_CHUNK: AcpUpdateEvent = {
  type: 'agent_thought_chunk',
  content: [{ type: 'text', text: 'Let me think about this...' }],
};

/** Helper: wrap a result in a JSON-RPC response envelope */
export function makeRpcResponse(id: number, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

/** Helper: make a JSON-RPC error response */
export function makeRpcError(id: number, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
```

---

### Post-File-Creation Steps

After creating all files, run these commands:

1. `cd /Users/leemoore/code/liminal-builder && bun install` -- Install all dependencies
2. `bun run verify` -- Verify full quality gate (format:check, biome lint, eslint, eslint-plugin tests, typecheck, server tests)

## Constraints

- Do NOT write any tests in this story. Tests start in Story 1.
- Do NOT implement business logic in stub methods. Every stub (except `json-store.ts`, `SessionManager.toCanonical`, `SessionManager.fromCanonical`) must throw `NotImplementedError`.
- Do NOT add any dependencies beyond those listed in `package.json`.
- Do NOT modify any files in `docs/`.
- The `json-store.ts` MUST be fully implemented -- it is infrastructure, not business logic.
- Client files are vanilla HTML/JS/CSS. No build step. No bundler. No framework.
- The `client/shared/markdown.js` file references marked via a path that will work when served statically. If this causes import issues at runtime, that is acceptable -- it will be fixed when chat rendering is implemented. The important thing is that the file exists and the typecheck passes (client JS is excluded from TS).

## If Blocked or Uncertain

- Resolve straightforward inconsistencies using feature spec + tech design as source of truth and continue.
- Surface assumptions in your summary; ask only for hard blockers.

## Verification

After creating all files and running `bun install`:

```bash
# 1. Verify must pass (full quality gate)
bun run verify
# Expected: No errors. Exit code 0.

# 2. Server must start
bun run start &
# Expected: "Liminal Builder running at http://localhost:3000"

# 3. Shell page must be served
curl -s http://localhost:3000/shell/index.html | head -5
# Expected: HTML content starting with <!DOCTYPE html>

# 4. Kill server
kill %1
```

## Done When

- [ ] All 31 files listed above are created
- [ ] `bun install` completes successfully
- [ ] `bun run verify` passes with zero errors
- [ ] `bun run start` starts the server on port 3000
- [ ] `http://localhost:3000/shell/index.html` serves the shell page
- [ ] `bun run verify-all` is wired and executable (integration/e2e may be placeholder/no-op in Story 0)
- [ ] All stub methods throw `NotImplementedError` (except `json-store.ts`, `toCanonical`, `fromCanonical`)
- [ ] No test files exist yet
