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
