import type {
	JsonRpcRequest,
	AcpInitializeResult,
	AcpCreateResult,
	AcpPromptResult,
	AcpUpdateEvent,
} from "./acp-types";
import type { ChatEntry } from "../../shared/types";

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
};

type WritableLike = {
	write: (chunk: string) => void;
	close?: () => void;
};

type ReadableLike = AsyncIterable<unknown>;

export class AcpClient {
	private nextId = 1;
	private pendingRequests = new Map<number, PendingRequest>();
	private agentCapabilities: AcpInitializeResult["agentCapabilities"] | null =
		null;
	private eventHandlers = new Map<string, (event: AcpUpdateEvent) => void>();
	private errorHandler: ((error: Error) => void) | null = null;
	private stdin: WritableLike;
	private stdout: ReadableLike;
	private readingStarted = false;
	private closed = false;
	private readBuffer = "";
	private readLoopDone: Promise<void> | null = null;

	constructor(stdin: WritableStream, stdout: ReadableStream) {
		if (!this.isWritableLike(stdin)) {
			throw new Error("Invalid ACP stdin stream");
		}
		if (!this.isReadableLike(stdout)) {
			throw new Error("Invalid ACP stdout stream");
		}

		this.stdin = stdin;
		this.stdout = stdout;
	}

	/** Send initialize handshake, negotiate capabilities.
	 *  Advertises fileSystem + terminal capabilities.
	 *  Stores agent capabilities (loadSession, etc.) for later use. */
	async initialize(): Promise<AcpInitializeResult> {
		if (!this.readingStarted) {
			this.readingStarted = true;
			this.readLoopDone = this.startReadLoop();
		}

		const result = await this.sendRequest<AcpInitializeResult>("initialize", {
			protocolVersion: 1,
			clientInfo: {
				name: "liminal-builder",
				title: "Liminal Builder",
				version: "0.1.0",
			},
			clientCapabilities: {
				fileSystem: { readTextFile: true, writeTextFile: true },
				terminal: true,
			},
		});

		this.agentCapabilities = result.agentCapabilities;
		return result;
	}

	/** session/new -- Create a new session with working directory */
	async sessionNew(params: { cwd: string }): Promise<AcpCreateResult> {
		return this.sendRequest<AcpCreateResult>("session/new", params);
	}

	/** session/load -- Resume session. Agent replays history as session/update
	 *  notifications before responding. Collects replayed events into ChatEntry[].
	 *  Requires agent capability: loadSession */
	async sessionLoad(sessionId: string, cwd: string): Promise<ChatEntry[]> {
		if (!this.canLoadSession) {
			throw new Error("Agent does not support session/load");
		}

		const history: ChatEntry[] = [];

		this.eventHandlers.set(sessionId, (event: AcpUpdateEvent) => {
			const entry = this.updateEventToChatEntry(event);
			if (entry) {
				history.push(entry);
			}
		});

		try {
			await this.sendRequest("session/load", { sessionId, cwd });
			return history;
		} finally {
			this.eventHandlers.delete(sessionId);
		}
	}

	/** session/prompt -- Send user message. The agent streams session/update
	 *  notifications (text chunks, tool calls, thinking). The prompt response
	 *  with stopReason signals completion.
	 *  onEvent callback fires for each session/update notification.
	 *  Returns the final stopReason. */
	async sessionPrompt(
		sessionId: string,
		content: string,
		onEvent: (event: AcpUpdateEvent) => void,
	): Promise<AcpPromptResult> {
		this.eventHandlers.set(sessionId, onEvent);

		try {
			return await this.sendRequest<AcpPromptResult>("session/prompt", {
				sessionId,
				content: [{ type: "text", text: content }],
			});
		} finally {
			this.eventHandlers.delete(sessionId);
		}
	}

	/** session/cancel -- Cancel in-progress prompt (notification, no response) */
	sessionCancel(sessionId: string): void {
		this.writeMessage({
			jsonrpc: "2.0",
			method: "session/cancel",
			params: { sessionId },
		});
	}

	/** Close stdin to signal shutdown. Wait up to timeoutMs for exit.
	 *  If the read loop exits within the timeout, pending requests are
	 *  rejected by the read loop cleanup. Otherwise, the timeout
	 *  force-rejects any remaining pending requests. */
	async close(timeoutMs?: number): Promise<void> {
		const effectiveTimeout = timeoutMs ?? 5000;
		this.closed = true;

		try {
			this.stdin.close?.();
		} catch (error: unknown) {
			this.emitError(this.toError(error));
		}

		if (this.readLoopDone) {
			const timeout = new Promise<"timeout">((resolve) => {
				setTimeout(() => resolve("timeout"), effectiveTimeout);
			});

			const result = await Promise.race([
				this.readLoopDone.then(() => "done" as const),
				timeout,
			]);

			if (result === "timeout") {
				this.rejectAllPending(new Error("Client closed"));
			}
		} else {
			// Read loop was never started; reject immediately
			this.rejectAllPending(new Error("Client closed"));
		}
	}

	/** Register handler for unexpected errors (broken pipe, parse error) */
	onError(handler: (error: Error) => void): void {
		this.errorHandler = handler;
	}

	/** Whether agent supports session/load */
	get canLoadSession(): boolean {
		return this.agentCapabilities?.loadSession ?? false;
	}

	private async sendRequest<T>(
		method: string,
		params?: Record<string, unknown>,
	): Promise<T> {
		if (this.closed) {
			throw new Error("Client closed");
		}

		const id = this.nextId++;
		const request: JsonRpcRequest = {
			jsonrpc: "2.0",
			id,
			method,
			...(params ? { params } : {}),
		};

		return new Promise<T>((resolve, reject) => {
			this.pendingRequests.set(id, {
				resolve: (value: unknown) => resolve(value as T),
				reject,
			});

			const writeError = this.writeMessage(request);
			if (writeError) {
				this.pendingRequests.delete(id);
				reject(writeError);
			}
		});
	}

	private writeMessage(message: unknown): Error | null {
		try {
			this.stdin.write(`${JSON.stringify(message)}\n`);
			return null;
		} catch (error: unknown) {
			const err = this.toError(error);
			this.emitError(err);
			return err;
		}
	}

	private async startReadLoop(): Promise<void> {
		try {
			for await (const chunk of this.stdout) {
				if (this.closed) {
					break;
				}

				this.readBuffer += this.chunkToString(chunk);
				this.processReadBuffer();
			}

			if (!this.closed) {
				const trailing = this.readBuffer.trim();
				if (trailing.length > 0) {
					this.handleLine(trailing);
				}
				this.readBuffer = "";

				const err = new Error("ACP stdout closed");
				this.emitError(err);
				this.rejectAllPending(err);
			}
		} catch (error: unknown) {
			if (!this.closed) {
				const err = this.toError(error);
				this.emitError(err);
				this.rejectAllPending(err);
			}
		}
	}

	private processReadBuffer(): void {
		let newlineIndex = this.readBuffer.indexOf("\n");
		while (newlineIndex >= 0) {
			const line = this.readBuffer.slice(0, newlineIndex).trim();
			this.readBuffer = this.readBuffer.slice(newlineIndex + 1);

			if (line.length > 0) {
				this.handleLine(line);
			}

			newlineIndex = this.readBuffer.indexOf("\n");
		}
	}

	private handleLine(line: string): void {
		let message: unknown;
		try {
			message = JSON.parse(line);
		} catch (error: unknown) {
			this.emitError(this.toError(error));
			return;
		}

		if (!this.isRecord(message)) {
			return;
		}

		const id = message.id;
		const method = message.method;

		if (typeof id === "number" && typeof method === "string") {
			const rawParams = message.params;
			const params = this.isRecord(rawParams) ? rawParams : undefined;
			this.handleAgentRequest(id, method, params);
			return;
		}

		if (typeof id === "number") {
			this.handleResponse(id, message.result, message.error);
			return;
		}

		if (typeof method === "string") {
			this.handleNotification(method, message.params);
		}
	}

	private handleResponse(id: number, result: unknown, error: unknown): void {
		const pending = this.pendingRequests.get(id);
		if (!pending) {
			return;
		}

		this.pendingRequests.delete(id);
		if (this.isRecord(error) && typeof error.message === "string") {
			pending.reject(new Error(error.message));
			return;
		}

		pending.resolve(result);
	}

	private handleNotification(method: string, params: unknown): void {
		if (method !== "session/update") {
			return;
		}

		if (!this.isRecord(params)) {
			return;
		}

		const sessionId = params.sessionId;
		const update = params.update;
		if (typeof sessionId !== "string" || !this.isRecord(update)) {
			return;
		}

		this.eventHandlers.get(sessionId)?.(update as AcpUpdateEvent);
	}

	private handleAgentRequest(
		id: number,
		method: string,
		params: Record<string, unknown> | undefined,
	): void {
		// params stored for future stories (fs/terminal delegation)
		void params;

		if (method === "session/request_permission") {
			this.writeMessage({
				jsonrpc: "2.0",
				id,
				result: { approved: true },
			});
			return;
		}

		// Explicitly reject unsupported inbound methods so agent requests do not hang.
		this.writeMessage({
			jsonrpc: "2.0",
			id,
			error: {
				code: -32601,
				message: `Method not supported: ${method}`,
			},
		});
	}

	private updateEventToChatEntry(event: AcpUpdateEvent): ChatEntry | null {
		const entryId = crypto.randomUUID();
		const timestamp = new Date().toISOString();

		switch (event.type) {
			case "user_message_chunk":
				return {
					entryId,
					type: "user",
					content: this.extractFirstText(event.content),
					timestamp,
				};
			case "agent_message_chunk":
				return {
					entryId,
					type: "assistant",
					content: this.extractFirstText(event.content),
					timestamp,
				};
			case "agent_thought_chunk":
				return {
					entryId,
					type: "thinking",
					content: this.extractFirstText(event.content),
				};
			case "tool_call":
				return {
					entryId,
					type: "tool-call",
					toolCallId: event.toolCallId,
					name: event.title,
					status: this.mapToolStatus(event.status),
				};
			case "tool_call_update":
			case "plan":
			case "config_options_update":
			case "current_mode_update":
				return null;
		}
	}

	private mapToolStatus(
		status: "pending" | "in_progress" | "completed" | "failed",
	): "running" | "complete" | "error" {
		switch (status) {
			case "pending":
			case "in_progress":
				return "running";
			case "completed":
				return "complete";
			case "failed":
				return "error";
		}
	}

	private extractFirstText(
		content: Array<{ type: "text"; text: string }>,
	): string {
		return content[0]?.text ?? "";
	}

	private emitError(error: Error): void {
		this.errorHandler?.(error);
	}

	private toError(error: unknown): Error {
		if (error instanceof Error) {
			return error;
		}
		return new Error(String(error));
	}

	private chunkToString(chunk: unknown): string {
		if (typeof chunk === "string") {
			return chunk;
		}
		if (chunk instanceof Uint8Array) {
			return new TextDecoder().decode(chunk);
		}
		return String(chunk);
	}

	private isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === "object" && value !== null;
	}

	private isWritableLike(value: unknown): value is WritableLike {
		return (
			this.isRecord(value) &&
			typeof (value as WritableLike).write === "function"
		);
	}

	private isReadableLike(value: unknown): value is ReadableLike {
		if (!this.isRecord(value)) {
			return false;
		}
		const maybeIterable = value as { [Symbol.asyncIterator]?: unknown };
		return typeof maybeIterable[Symbol.asyncIterator] === "function";
	}

	private rejectAllPending(error: Error): void {
		const pending = [...this.pendingRequests.values()];
		this.pendingRequests.clear();
		for (const request of pending) {
			request.reject(error);
		}
	}
}
