import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AcpClient } from "../../server/acp/acp-client";
import {
	createMockStdio,
	mockInitializeResponse,
	mockSessionNewResponse,
	mockSessionLoadResponse,
	mockSessionPromptResponse,
	mockUpdateNotification,
	mockPermissionRequest,
	mockJsonRpcError,
} from "../fixtures/acp-messages";
import type { AcpUpdateEvent } from "../../server/acp/acp-types";

async function waitUntil(
	condition: () => boolean,
	timeoutMs = 250,
): Promise<void> {
	const startedAt = Date.now();
	while (!condition()) {
		if (Date.now() - startedAt > timeoutMs) {
			throw new Error("Timed out waiting for condition");
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

describe("AcpClient", () => {
	let mock: ReturnType<typeof createMockStdio>;
	let client: AcpClient;

	beforeEach(() => {
		mock = createMockStdio();
		client = new AcpClient(mock.stdin, mock.stdout);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("initialize sends correct protocol version and capabilities", async () => {
		// Queue the initialize response (agent will respond to request id 1)
		mock.pushMessage(mockInitializeResponse(1));

		const result = await client.initialize();

		// Verify what was sent to stdin
		const sent = mock.getSentMessages();
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: 1,
				clientInfo: {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					name: expect.any(String),
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					title: expect.any(String),
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
		expect(result.agentInfo.name).toBe("mock-agent");
		expect(result.agentCapabilities.loadSession).toBe(true);

		// Verify capabilities stored
		expect(client.canLoadSession).toBe(true);
	});

	it("sessionNew sends cwd parameter and returns sessionId", async () => {
		// Initialize first
		mock.pushMessage(mockInitializeResponse(1));
		await client.initialize();

		// Queue session/new response
		mock.pushMessage(mockSessionNewResponse(2, "sess-abc123"));

		const result = await client.sessionNew({ cwd: "/home/user/project" });

		const sent = mock.getSentMessages();
		expect(sent).toHaveLength(2);
		expect(sent[1]).toMatchObject({
			jsonrpc: "2.0",
			id: 2,
			method: "session/new",
			params: { cwd: "/home/user/project", mcpServers: [] },
		});

		expect(result.sessionId).toBe("sess-abc123");
	});

	it("sessionLoad collects replayed history from update notifications", async () => {
		// Initialize
		mock.pushMessage(mockInitializeResponse(1));
		await client.initialize();

		// Queue: replay notifications THEN load response
		// The agent replays history as session/update notifications before
		// sending the session/load response.
		mock.pushMessages([
			mockUpdateNotification("sess-123", {
				type: "user_message_chunk",
				content: [{ type: "text", text: "Hello agent" }],
			}),
			mockUpdateNotification("sess-123", {
				type: "agent_message_chunk",
				content: [{ type: "text", text: "Hello! How can I help?" }],
			}),
			mockUpdateNotification("sess-123", {
				type: "tool_call",
				toolCallId: "tc-1",
				title: "Read File",
				status: "completed",
				content: [{ type: "text", text: "file contents" }],
			}),
			mockSessionLoadResponse(2),
		]);

		const history = await client.sessionLoad("sess-123", "/home/user/project");

		// Should have collected the replayed notifications into ChatEntry[]
		expect(history).toHaveLength(3);
		expect(history[0]).toMatchObject({ type: "user", content: "Hello agent" });
		expect(history[1]).toMatchObject({
			type: "assistant",
			content: "Hello! How can I help?",
		});
		expect(history[2]).toMatchObject({
			type: "tool-call",
			toolCallId: "tc-1",
			name: "Read File",
			status: "complete",
		});

		// Verify session/load request was sent
		const sent = mock.getSentMessages();
		expect(sent[1]).toMatchObject({
			method: "session/load",
			params: {
				sessionId: "sess-123",
				cwd: "/home/user/project",
				mcpServers: [],
			},
		});
	});

	it("sessionLoad falls back to session/load when session/resume is unavailable", async () => {
		mock.pushMessage(
			mockInitializeResponse(1, {
				canResumeSession: true,
			}),
		);
		await client.initialize();

		mock.pushMessage({
			jsonrpc: "2.0",
			id: 2,
			error: {
				code: -32601,
				message: "Method not found",
			},
		});

		const historyPromise = client.sessionLoad("sess-123", "/home/user/project");
		await waitUntil(() => {
			const sent = mock.getSentMessages();
			return sent.some(
				(msg) =>
					typeof msg === "object" &&
					msg !== null &&
					(msg as { method?: unknown }).method === "session/load",
			);
		});
		mock.pushMessage(mockSessionLoadResponse(3));
		const history = await historyPromise;
		expect(history).toEqual([]);

		const sent = mock.getSentMessages();
		expect(sent[1]).toMatchObject({
			method: "session/resume",
			params: {
				sessionId: "sess-123",
				cwd: "/home/user/project",
				mcpServers: [],
			},
		});
		expect(sent[2]).toMatchObject({
			method: "session/load",
			params: {
				sessionId: "sess-123",
				cwd: "/home/user/project",
				mcpServers: [],
			},
		});
	});

	it("sessionPrompt fires onEvent for each update notification", async () => {
		// Initialize
		mock.pushMessage(mockInitializeResponse(1));
		await client.initialize();

		// Queue: streaming notifications then prompt response
		mock.pushMessages([
			mockUpdateNotification("sess-123", {
				type: "agent_message_chunk",
				content: [{ type: "text", text: "Here is my " }],
			}),
			mockUpdateNotification("sess-123", {
				type: "agent_message_chunk",
				content: [{ type: "text", text: "response." }],
			}),
			mockUpdateNotification("sess-123", {
				type: "tool_call",
				toolCallId: "tc-2",
				title: "Write File",
				status: "in_progress",
			}),
			mockSessionPromptResponse(2, "end_turn"),
		]);

		const events: AcpUpdateEvent[] = [];
		const result = await client.sessionPrompt(
			"sess-123",
			"Write a file for me",
			(event) => events.push(event),
		);

		// All streaming events received in order
		expect(events).toHaveLength(3);
		expect(events[0].type).toBe("agent_message_chunk");
		expect(events[1].type).toBe("agent_message_chunk");
		expect(events[2].type).toBe("tool_call");

		// Prompt completed with stopReason
		expect(result.stopReason).toBe("end_turn");
	});

	it("normalizes sessionUpdate payloads that omit the type field", async () => {
		mock.pushMessage(mockInitializeResponse(1));
		await client.initialize();

		mock.pushMessages([
			mockUpdateNotification("sess-123", {
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: "hello from normalized event" },
			}),
			mockSessionPromptResponse(2, "end_turn"),
		]);

		const events: AcpUpdateEvent[] = [];
		await client.sessionPrompt("sess-123", "Hello", (event) =>
			events.push(event),
		);

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "agent_message_chunk",
			content: [{ type: "text", text: "hello from normalized event" }],
		});
	});

	it("sessionPrompt resolves with stopReason on completion", async () => {
		// Initialize
		mock.pushMessage(mockInitializeResponse(1));
		await client.initialize();

		// Queue: just the prompt response (no streaming events)
		mock.pushMessage(mockSessionPromptResponse(2, "max_tokens"));

		const result = await client.sessionPrompt("sess-123", "Hello", () => {});

		expect(result).toEqual({ stopReason: "max_tokens" });
	});

	it("handleAgentRequest auto-approves permission requests", async () => {
		// Initialize
		mock.pushMessage(mockInitializeResponse(1));
		await client.initialize();

		// Agent sends a permission request (this is a JSON-RPC request FROM agent TO client)
		// The client must auto-approve by responding with { approved: true }
		// We simulate this during a prompt call -- the permission request arrives
		// interleaved with streaming updates.
		mock.pushMessages([
			// Agent asks for permission (JSON-RPC request with id)
			mockPermissionRequest(100, "tc-perm", "Execute bash command"),
			// Then prompt completes
			mockSessionPromptResponse(2, "end_turn"),
		]);

		await client.sessionPrompt("sess-123", "Run a command", () => {});

		// Verify the client sent back an approval response
		const sent = mock.getSentMessages();
		// Find the response to the permission request (id: 100)
		const approvalResponse = sent.find((msg) => {
			if (typeof msg !== "object" || msg === null) {
				return false;
			}
			const maybeRpcMessage = msg as { id?: unknown; result?: unknown };
			return maybeRpcMessage.id === 100 && maybeRpcMessage.result !== undefined;
		});
		expect(approvalResponse).toBeTruthy();
		expect((approvalResponse as { result: unknown }).result).toMatchObject({
			approved: true,
		});
	});

	it("handles JSON-RPC error responses", async () => {
		// Initialize
		mock.pushMessage(mockInitializeResponse(1));
		await client.initialize();

		// Queue an error response to session/new
		mock.pushMessage(mockJsonRpcError(2, -32600, "Invalid session parameters"));

		await expect(client.sessionNew({ cwd: "/nonexistent" })).rejects.toThrow(
			"Invalid session parameters",
		);
	});

	it("sessionCancel sends a JSON-RPC notification (no id field)", async () => {
		// Initialize
		mock.pushMessage(mockInitializeResponse(1));
		await client.initialize();

		client.sessionCancel("sess-123");

		const sent = mock.getSentMessages();
		expect(sent).toHaveLength(2);
		expect(sent[1]).toMatchObject({
			jsonrpc: "2.0",
			method: "session/cancel",
			params: { sessionId: "sess-123" },
		});
		expect(sent[1]).not.toHaveProperty("id");
	});

	it("close sends stdin close and cleans up pending state", async () => {
		// Initialize first
		mock.pushMessage(mockInitializeResponse(1));
		await client.initialize();

		const closeSpy = vi.spyOn(mock.stdin as { close: () => void }, "close");

		// close() should close stdin.
		await client.close(100);
		expect(closeSpy).toHaveBeenCalledTimes(1);
	});
});
