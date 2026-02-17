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
type ReplayConsumer = (entry: ChatEntry) => void;
type ReplayState = {
	pendingTextEntry: Extract<ChatEntry, { type: "user" | "assistant" }> | null;
	toolEntriesByCallId: Map<string, Extract<ChatEntry, { type: "tool-call" }>>;
};

export class AcpClient {
	private nextId = 1;
	private pendingRequests = new Map<number, PendingRequest>();
	private agentCapabilities: AcpInitializeResult["agentCapabilities"] | null =
		null;
	private eventHandlers = new Map<string, (event: AcpUpdateEvent) => void>();
	private sessionUpdateSubscribers = new Map<
		string,
		Set<(event: AcpUpdateEvent) => void>
	>();
	private errorHandler: ((error: Error) => void) | null = null;
	private stdin: WritableLike;
	private stdout: ReadableLike;
	private readingStarted = false;
	private closed = false;
	private readLineRemainder = "";
	private readLoopDone: Promise<void> | null = null;
	private readonly textDecoder = new TextDecoder();

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
		return this.sendRequest<AcpCreateResult>("session/new", {
			cwd: params.cwd,
			mcpServers: [],
		});
	}

	/** Resume session history. Depending on adapter version, this is either
	 *  session/load or session/resume. Replayed session/update notifications are
	 *  collected into ChatEntry[]. */
	async sessionLoad(
		sessionId: string,
		cwd: string,
		onReplayEntry?: ReplayConsumer,
	): Promise<ChatEntry[]> {
		return this.sessionLoadWithReplay(sessionId, cwd, onReplayEntry);
	}

	/** session/load with optional replay callback for progressive history rendering. */
	async sessionLoadWithReplay(
		sessionId: string,
		cwd: string,
		onReplayEntry?: ReplayConsumer,
	): Promise<ChatEntry[]> {
		if (!this.canLoadSession && !this.canResumeSession) {
			throw new Error("Agent does not support session/load");
		}

		const history: ChatEntry[] = [];
		const replayState: ReplayState = {
			pendingTextEntry: null,
			toolEntriesByCallId: new Map(),
		};

		this.eventHandlers.set(sessionId, (event: AcpUpdateEvent) => {
			this.applyReplayEvent(history, replayState, event, onReplayEntry);
		});

		try {
			await this.loadWithSupportedMethod(sessionId, cwd);
			return history;
		} finally {
			this.eventHandlers.delete(sessionId);
		}
	}

	/** session/prompt -- Send user message. The agent streams session/update
	 *  notifications (text chunks, tool calls, thinking). The prompt response
	 *  with stopReason signals completion.
	 *  onEvent callback fires for each session/update notification.
	 *  Optional for callers that subscribe via onSessionUpdate.
	 *  Returns the final stopReason. */
	async sessionPrompt(
		sessionId: string,
		content: string,
		onEvent?: (event: AcpUpdateEvent) => void,
	): Promise<AcpPromptResult> {
		if (onEvent) {
			this.eventHandlers.set(sessionId, onEvent);
		}

		try {
			return await this.sendRequest<AcpPromptResult>("session/prompt", {
				sessionId,
				prompt: [{ type: "text", text: content }],
			});
		} finally {
			if (onEvent) {
				this.eventHandlers.delete(sessionId);
			}
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

	/** Subscribe to all session/update notifications for a session. */
	onSessionUpdate(
		sessionId: string,
		handler: (event: AcpUpdateEvent) => void,
	): () => void {
		const subscribers =
			this.sessionUpdateSubscribers.get(sessionId) ?? new Set();
		subscribers.add(handler);
		this.sessionUpdateSubscribers.set(sessionId, subscribers);

		return () => {
			const current = this.sessionUpdateSubscribers.get(sessionId);
			if (!current) {
				return;
			}
			current.delete(handler);
			if (current.size === 0) {
				this.sessionUpdateSubscribers.delete(sessionId);
			}
		};
	}

	/** Whether agent supports session/load */
	get canLoadSession(): boolean {
		return this.agentCapabilities?.loadSession ?? false;
	}

	/** Whether agent supports session/resume */
	get canResumeSession(): boolean {
		return this.agentCapabilities?.sessionCapabilities?.resume !== undefined;
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

				const chunkText = this.chunkToString(chunk);
				this.processReadChunk(chunkText);
			}

			if (!this.closed) {
				const decoderRemainder = this.textDecoder.decode();
				if (decoderRemainder.length > 0) {
					this.processReadChunk(decoderRemainder);
				}

				const trailing = this.readLineRemainder.trim();
				if (trailing.length > 0) {
					this.handleLine(trailing);
				}
				this.readLineRemainder = "";

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

	private processReadChunk(chunkText: string): void {
		if (chunkText.length === 0) {
			return;
		}

		const lines = chunkText.split("\n");
		if (lines.length === 1) {
			this.readLineRemainder += lines[0] ?? "";
			return;
		}

		const firstLine = `${this.readLineRemainder}${lines[0] ?? ""}`.trim();
		if (firstLine.length > 0) {
			this.handleLine(firstLine);
		}

		for (let index = 1; index < lines.length - 1; index += 1) {
			const line = (lines[index] ?? "").trim();
			if (line.length > 0) {
				this.handleLine(line);
			}
		}

		this.readLineRemainder = lines[lines.length - 1] ?? "";
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
			let errorMessage = error.message;
			if (this.isRecord(error.data) && typeof error.data.details === "string") {
				errorMessage = `${errorMessage}: ${error.data.details}`;
			}
			pending.reject(new Error(errorMessage));
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

		const normalized = this.normalizeUpdateEvent(update);
		if (!normalized) {
			return;
		}

		this.eventHandlers.get(sessionId)?.(normalized);
		const subscribers = this.sessionUpdateSubscribers.get(sessionId);
		if (!subscribers || subscribers.size === 0) {
			return;
		}
		for (const subscriber of subscribers) {
			subscriber(normalized);
		}
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

	private emitReplayEntry(
		entry: ChatEntry,
		onReplayEntry: ReplayConsumer | undefined,
	): void {
		onReplayEntry?.(entry);
	}

	private appendTextReplay(
		history: ChatEntry[],
		replayState: ReplayState,
		entryType: "user" | "assistant",
		text: string,
		onReplayEntry: ReplayConsumer | undefined,
	): void {
		if (text.length === 0) {
			return;
		}

		const pending = replayState.pendingTextEntry;
		if (pending && pending.type === entryType) {
			pending.content += text;
			this.emitReplayEntry(pending, onReplayEntry);
			return;
		}

		const entry: Extract<ChatEntry, { type: "user" | "assistant" }> = {
			entryId: crypto.randomUUID(),
			type: entryType,
			content: text,
			timestamp: new Date().toISOString(),
		};
		replayState.pendingTextEntry = entry;
		history.push(entry);
		this.emitReplayEntry(entry, onReplayEntry);
	}

	private applyReplayEvent(
		history: ChatEntry[],
		replayState: ReplayState,
		event: AcpUpdateEvent,
		onReplayEntry: ReplayConsumer | undefined,
	): void {
		switch (event.type) {
			case "user_message_chunk":
				this.appendTextReplay(
					history,
					replayState,
					"user",
					this.extractFirstText(event.content),
					onReplayEntry,
				);
				return;
			case "agent_message_chunk":
				this.appendTextReplay(
					history,
					replayState,
					"assistant",
					this.extractFirstText(event.content),
					onReplayEntry,
				);
				return;
			case "agent_thought_chunk": {
				replayState.pendingTextEntry = null;
				const content = this.extractFirstText(event.content);
				if (content.length === 0) {
					return;
				}
				const entry: Extract<ChatEntry, { type: "thinking" }> = {
					entryId: crypto.randomUUID(),
					type: "thinking",
					content,
				};
				history.push(entry);
				this.emitReplayEntry(entry, onReplayEntry);
				return;
			}
			case "tool_call": {
				replayState.pendingTextEntry = null;
				const toolCallId = this.extractToolCallId(event) ?? crypto.randomUUID();
				const status = this.mapToolStatus(
					typeof event.status === "string" ? event.status : undefined,
				);
				const toolName = this.extractToolName(event) ?? "Tool call";
				const existing = replayState.toolEntriesByCallId.get(toolCallId);
				const entry =
					existing ??
					({
						entryId: crypto.randomUUID(),
						type: "tool-call",
						toolCallId,
						name: toolName,
						status,
					} satisfies Extract<ChatEntry, { type: "tool-call" }>);
				entry.name = toolName;
				entry.status = status;
				const content = this.extractFirstText(event.content);
				if (status === "complete" && content.length > 0) {
					entry.result = content;
				}
				if (status === "error" && content.length > 0) {
					entry.error = content;
				}
				if (!existing) {
					replayState.toolEntriesByCallId.set(toolCallId, entry);
					history.push(entry);
				}
				this.emitReplayEntry(entry, onReplayEntry);
				return;
			}
			case "tool_call_update": {
				replayState.pendingTextEntry = null;
				const toolCallId = this.extractToolCallId(event) ?? crypto.randomUUID();
				const existing = replayState.toolEntriesByCallId.get(toolCallId);
				const status = this.mapToolStatus(
					typeof event.status === "string" ? event.status : undefined,
				);
				const entry =
					existing ??
					({
						entryId: crypto.randomUUID(),
						type: "tool-call",
						toolCallId,
						name: "Tool call",
						status,
					} satisfies Extract<ChatEntry, { type: "tool-call" }>);
				entry.status = status;
				const content = this.extractFirstText(event.content);
				if (status === "complete" && content.length > 0) {
					entry.result = content;
				}
				if (status === "error" && content.length > 0) {
					entry.error = content;
				}
				if (!existing) {
					replayState.toolEntriesByCallId.set(toolCallId, entry);
					history.push(entry);
				}
				this.emitReplayEntry(entry, onReplayEntry);
				return;
			}
			default:
				return;
		}
	}

	private mapToolStatus(
		status: string | undefined,
	): "running" | "complete" | "error" {
		switch (status) {
			case "pending":
			case "in_progress":
			case "running":
			case undefined:
				return "running";
			case "completed":
			case "complete":
				return "complete";
			case "failed":
			case "error":
				return "error";
			default:
				return "running";
		}
	}

	private extractFirstText(content: unknown): string {
		const blocks = this.normalizeContentBlocks(content);
		return blocks?.[0]?.text ?? "";
	}

	private normalizeUpdateEvent(
		update: Record<string, unknown>,
	): AcpUpdateEvent | null {
		const type = this.getUpdateType(update);
		if (!type) {
			return null;
		}

		const normalized: Record<string, unknown> = {
			...update,
			type,
		};
		delete normalized.sessionUpdate;

		if ("content" in normalized) {
			normalized.content = this.normalizeContentBlocks(normalized.content);
		}
		if (type === "tool_call" || type === "tool_call_update") {
			const callId = this.extractToolCallIdFromRecord(normalized);
			if (callId) {
				normalized.callId = callId;
				normalized.toolCallId = callId;
			}
			const toolName = this.extractToolNameFromRecord(normalized);
			if (toolName) {
				normalized.toolName = toolName;
				normalized.title = toolName;
			}
		}

		return normalized as AcpUpdateEvent;
	}

	private getUpdateType(update: Record<string, unknown>): string | null {
		if (typeof update.type === "string") {
			return update.type;
		}
		if (typeof update.sessionUpdate === "string") {
			return update.sessionUpdate;
		}
		return null;
	}

	private extractToolCallId(event: AcpUpdateEvent): string | undefined {
		const candidate = event as Record<string, unknown>;
		return this.extractToolCallIdFromRecord(candidate);
	}

	private extractToolCallIdFromRecord(
		value: Record<string, unknown>,
	): string | undefined {
		if (typeof value.toolCallId === "string") {
			return value.toolCallId;
		}
		if (typeof value.callId === "string") {
			return value.callId;
		}
		if (typeof value.tool_call_id === "string") {
			return value.tool_call_id;
		}
		return undefined;
	}

	private extractToolName(event: AcpUpdateEvent): string | undefined {
		const candidate = event as Record<string, unknown>;
		return this.extractToolNameFromRecord(candidate);
	}

	private extractToolNameFromRecord(
		value: Record<string, unknown>,
	): string | undefined {
		if (typeof value.title === "string" && value.title.length > 0) {
			return value.title;
		}
		if (typeof value.toolName === "string" && value.toolName.length > 0) {
			return value.toolName;
		}
		return undefined;
	}

	private normalizeContentBlocks(
		content: unknown,
	): Array<{ type: "text"; text: string }> | undefined {
		if (Array.isArray(content)) {
			return content
				.filter((candidate) => this.isRecord(candidate))
				.flatMap((candidate) => {
					if (candidate.type === "text" && typeof candidate.text === "string") {
						return [{ type: "text" as const, text: candidate.text }];
					}
					return [];
				});
		}

		if (this.isRecord(content)) {
			if (content.type === "text" && typeof content.text === "string") {
				return [{ type: "text", text: content.text }];
			}
		}

		return undefined;
	}

	private async loadWithSupportedMethod(
		sessionId: string,
		cwd: string,
	): Promise<void> {
		const params = { sessionId, cwd, mcpServers: [] };

		if (this.canLoadSession) {
			try {
				await this.sendRequest("session/load", params);
				return;
			} catch (error: unknown) {
				const err = this.toError(error);
				if (!this.isMethodNotFoundError(err)) {
					throw err;
				}

				try {
					await this.sendRequest("session/resume", params);
					return;
				} catch (resumeError: unknown) {
					const resumeErr = this.toError(resumeError);
					if (this.isMethodNotFoundError(resumeErr)) {
						throw err;
					}
					throw resumeErr;
				}
			}
		}

		if (this.canResumeSession) {
			try {
				await this.sendRequest("session/resume", params);
				return;
			} catch (error: unknown) {
				const err = this.toError(error);
				if (!this.isMethodNotFoundError(err)) {
					throw err;
				}

				try {
					await this.sendRequest("session/load", params);
					return;
				} catch (loadError: unknown) {
					const loadErr = this.toError(loadError);
					if (this.isMethodNotFoundError(loadErr)) {
						throw err;
					}
					throw loadErr;
				}
			}
		}

		throw new Error("Agent does not support session/load");
	}

	private isMethodNotFoundError(error: Error): boolean {
		const message = error.message.toLowerCase();
		return (
			message.includes("method not found") ||
			message.includes("method not supported")
		);
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
			return this.textDecoder.decode(chunk, { stream: true });
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
