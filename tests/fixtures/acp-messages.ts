import type {
	JsonRpcResponse,
	AcpInitializeResult,
	AcpCreateResult,
	AcpPromptResult,
	AcpUpdateEvent,
} from "../../server/acp/acp-types";

/** Mock ACP initialize response */
export const MOCK_INIT_RESULT: AcpInitializeResult = {
	protocolVersion: 1,
	agentInfo: { name: "claude-code", title: "Claude Code", version: "1.0.0" },
	agentCapabilities: {
		loadSession: true,
		promptCapabilities: { image: false, embeddedContext: true },
	},
};

/** Mock ACP session/new result */
export const MOCK_CREATE_RESULT: AcpCreateResult = {
	sessionId: "acp-session-xyz",
};

/** Mock ACP session/prompt result (end_turn) */
export const MOCK_PROMPT_RESULT: AcpPromptResult = {
	stopReason: "end_turn",
};

/** Mock agent_message_chunk event */
export const MOCK_MESSAGE_CHUNK: AcpUpdateEvent = {
	type: "agent_message_chunk",
	content: [{ type: "text", text: "Hello, I can help you with that." }],
};

/** Mock tool_call event */
export const MOCK_TOOL_CALL: AcpUpdateEvent = {
	type: "tool_call",
	toolCallId: "tc-001",
	title: "Read file",
	status: "in_progress",
	content: [{ type: "text", text: "Reading src/index.ts" }],
};

/** Mock tool_call_update (completed) */
export const MOCK_TOOL_CALL_UPDATE: AcpUpdateEvent = {
	type: "tool_call_update",
	toolCallId: "tc-001",
	status: "completed",
	content: [{ type: "text", text: "File contents read successfully" }],
};

/** Mock thought chunk */
export const MOCK_THOUGHT_CHUNK: AcpUpdateEvent = {
	type: "agent_thought_chunk",
	content: [{ type: "text", text: "Let me think about this..." }],
};

/** Helper: wrap a result in a JSON-RPC response envelope */
export function makeRpcResponse(id: number, result: unknown): JsonRpcResponse {
	return { jsonrpc: "2.0", id, result };
}

/** Helper: make a JSON-RPC error response */
export function makeRpcError(
	id: number,
	code: number,
	message: string,
): JsonRpcResponse {
	return { jsonrpc: "2.0", id, error: { code, message } };
}

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
			const lines = chunk.split("\n").filter((l) => l.trim());
			for (const line of lines) {
				sentMessages.push(JSON.parse(line));
			}
		},
		close() {
			/* no-op for tests */
		},
	};

	// Readable stdout -- yields queued responses
	// Implementation: an async iterable that yields lines from responseQueue
	const stdoutReader = {
		[Symbol.asyncIterator]() {
			return {
				async next(): Promise<{ value: string; done: boolean }> {
					while (responseQueue.length === 0) {
						await new Promise<void>((resolve) => {
							responseResolve = resolve;
						});
					}
					return { value: responseQueue.shift() as string, done: false };
				},
			};
		},
	};

	return {
		stdin: stdinWriter as unknown as WritableStream,
		stdout: stdoutReader as unknown as ReadableStream,

		/** Queue a JSON-RPC message for the client to read */
		pushMessage(msg: unknown) {
			responseQueue.push(`${JSON.stringify(msg)}\n`);
			if (responseResolve) {
				const resolve = responseResolve;
				responseResolve = null;
				resolve();
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

export function mockInitializeResponse(
	id: number,
	overrides?: Partial<{
		loadSession: boolean;
	}>,
) {
	return {
		jsonrpc: "2.0" as const,
		id,
		result: {
			protocolVersion: 1,
			agentInfo: {
				name: "mock-agent",
				title: "Mock Agent",
				version: "1.0.0",
			},
			agentCapabilities: {
				loadSession: overrides?.loadSession ?? true,
				promptCapabilities: { image: false, embeddedContext: false },
			},
		},
	};
}

export function mockSessionNewResponse(id: number, sessionId: string) {
	return {
		jsonrpc: "2.0" as const,
		id,
		result: { sessionId },
	};
}

export function mockSessionLoadResponse(id: number) {
	return {
		jsonrpc: "2.0" as const,
		id,
		result: {},
	};
}

export function mockSessionPromptResponse(id: number, stopReason = "end_turn") {
	return {
		jsonrpc: "2.0" as const,
		id,
		result: { stopReason },
	};
}

export function mockUpdateNotification(sessionId: string, event: unknown) {
	return {
		jsonrpc: "2.0" as const,
		method: "session/update",
		params: { sessionId, update: event },
	};
}

export function mockPermissionRequest(
	id: number,
	toolCallId: string,
	title: string,
) {
	return {
		jsonrpc: "2.0" as const,
		id,
		method: "session/request_permission",
		params: { toolCallId, title },
	};
}

export function mockJsonRpcError(id: number, code: number, message: string) {
	return {
		jsonrpc: "2.0" as const,
		id,
		error: { code, message },
	};
}
