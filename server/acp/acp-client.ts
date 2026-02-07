import { NotImplementedError } from "../errors";
import type {
	AcpInitializeResult,
	AcpCreateResult,
	AcpPromptResult,
	AcpUpdateEvent,
} from "./acp-types";
import type { ChatEntry } from "../../shared/types";

/**
 * JSON-RPC client communicating with an ACP agent process over stdio.
 * Implements newline-delimited JSON-RPC 2.0.
 *
 * Constructor takes stdin (writable) and stdout (readable) of the child process.
 * Tests mock these with in-memory streams.
 */
export class AcpClient {
	private nextId = 1;
	private pendingRequests = new Map<
		number,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
		}
	>();
	private agentCapabilities: AcpInitializeResult["agentCapabilities"] | null = null;
	private eventHandlers = new Map<string, (event: AcpUpdateEvent) => void>();
	private errorHandler: ((error: Error) => void) | null = null;
	private stdin: WritableStream;
	private stdout: ReadableStream;

	constructor(stdin: WritableStream, stdout: ReadableStream) {
		this.stdin = stdin;
		this.stdout = stdout;
		this.touchSkeletonState();
		// NOTE: Do NOT start reading stdout in the constructor.
		// Reading starts in initialize() to keep construction synchronous.
	}

	private touchSkeletonState(): void {
		// Red phase: keep placeholder protocol state while methods are stubs.
		void this.nextId;
		void this.pendingRequests;
		void this.eventHandlers;
		void this.errorHandler;
		void this.stdin;
		void this.stdout;
	}

	/** Send initialize handshake, negotiate capabilities.
	 *  Advertises fileSystem + terminal capabilities.
	 *  Stores agent capabilities (loadSession, etc.) for later use. */
	async initialize(): Promise<AcpInitializeResult> {
		throw new NotImplementedError("AcpClient.initialize");
	}

	/** session/new -- Create a new session with working directory */
	async sessionNew(_params: { cwd: string }): Promise<AcpCreateResult> {
		throw new NotImplementedError("AcpClient.sessionNew");
	}

	/** session/load -- Resume session. Agent replays history as session/update
	 *  notifications before responding. Collects replayed events into ChatEntry[].
	 *  Requires agent capability: loadSession */
	async sessionLoad(_sessionId: string, _cwd: string): Promise<ChatEntry[]> {
		throw new NotImplementedError("AcpClient.sessionLoad");
	}

	/** session/prompt -- Send user message. The agent streams session/update
	 *  notifications (text chunks, tool calls, thinking). The prompt response
	 *  with stopReason signals completion.
	 *  onEvent callback fires for each session/update notification.
	 *  Returns the final stopReason. */
	async sessionPrompt(
		_sessionId: string,
		_content: string,
		_onEvent: (event: AcpUpdateEvent) => void,
	): Promise<AcpPromptResult> {
		throw new NotImplementedError("AcpClient.sessionPrompt");
	}

	/** session/cancel -- Cancel in-progress prompt (notification, no response) */
	sessionCancel(_sessionId: string): void {
		throw new NotImplementedError("AcpClient.sessionCancel");
	}

	/** Close stdin to signal shutdown. Wait up to timeoutMs for exit. */
	async close(_timeoutMs?: number): Promise<void> {
		throw new NotImplementedError("AcpClient.close");
	}

	/** Register handler for unexpected errors (broken pipe, parse error) */
	onError(_handler: (error: Error) => void): void {
		throw new NotImplementedError("AcpClient.onError");
	}

	/** Whether agent supports session/load */
	get canLoadSession(): boolean {
		return this.agentCapabilities?.loadSession ?? false;
	}
}
