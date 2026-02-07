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
