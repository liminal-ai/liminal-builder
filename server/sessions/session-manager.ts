import type { JsonStore } from "../store/json-store";
import { join } from "node:path";
import type {
	SessionMeta,
	SessionListItem,
	CliType,
	SessionPromptResult,
} from "./session-types";
import { VALID_CLI_TYPES } from "./session-types";
import type { AgentManager } from "../acp/agent-manager";
import type { AcpUpdateEvent } from "../acp/acp-types";
import type { ChatEntry } from "../../shared/types";
import type { ProjectStore } from "../projects/project-store";
import type { CliProvider } from "../providers/provider-types";
import type { TurnEvent, UpsertObject } from "../streaming/upsert-types";
import { loadClaudeSessionHistory } from "./claude-session-history";
import { discoverAllSessions } from "./session-discovery";

interface SessionManagerDeps {
	claudeProvider?: CliProvider;
}

interface PendingClaudePrompt {
	onEvent: (event: AcpUpdateEvent) => void;
	resolve: (result: SessionPromptResult) => void;
	reject: (error: Error) => void;
	itemContentByItemId: Map<string, string>;
}

interface ClaudeSessionRuntime {
	providerSessionId: string;
	listenersAttached: boolean;
	pendingByTurnId: Map<string, PendingClaudePrompt>;
	bufferedUpsertsByTurnId: Map<string, UpsertObject[]>;
	bufferedTerminalByTurnId: Map<
		string,
		Extract<TurnEvent, { type: "turn_complete" | "turn_error" }>
	>;
}

const CLAUDE_LOAD_TIMEOUT_MS = 15_000;

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
	private sessions: SessionMeta[];
	private readonly claudeProvider?: CliProvider;
	private readonly claudeRuntimeByCanonicalId = new Map<
		string,
		ClaudeSessionRuntime
	>();
	private readonly claudeInitByCanonicalId = new Map<
		string,
		Promise<ClaudeSessionRuntime>
	>();

	constructor(
		private readonly store: JsonStore<SessionMeta[]>,
		private readonly agentManager: AgentManager,
		private readonly projectStore: ProjectStore,
		deps?: SessionManagerDeps,
	) {
		this.sessions = this.store.readSync();
		if (deps?.claudeProvider?.cliType === "claude-code") {
			this.claudeProvider = deps.claudeProvider;
		}
	}

	/** Create session via ACP session/new and record local metadata.
	 *  Title defaults to "New Session" until first user message. */
	async createSession(projectId: string, cliType: CliType): Promise<string> {
		const cwd = await this.resolveProjectPath(projectId);
		let acpId: string;
		if (cliType === "claude-code" && this.claudeProvider) {
			const created = await this.claudeProvider.createSession({
				projectDir: cwd,
			});
			acpId = created.sessionId;
		} else {
			const client = await this.agentManager.ensureAgent(cliType);
			const created = await client.sessionNew({ cwd });
			acpId = created.sessionId;
		}
		const canonicalId = SessionManager.toCanonical(cliType, acpId);
		const now = new Date().toISOString();

		this.sessions.push({
			id: canonicalId,
			projectId,
			cliType,
			archived: false,
			title: "New Session",
			lastActiveAt: now,
			createdAt: now,
		});
		await this.store.writeSync(this.sessions);
		if (cliType === "claude-code" && this.claudeProvider) {
			this.ensureClaudeRuntime(canonicalId, acpId);
		}

		return canonicalId;
	}

	/** Open session via ACP session/load, collect replayed history.
	 *  Works for both Builder-created sessions AND discovered CLI sessions.
	 *  Does NOT update lastActiveAt (only message send/receive updates it). */
	async openSession(
		canonicalId: string,
		onReplayEntry?: (entry: ChatEntry) => void,
		projectId?: string,
	): Promise<ChatEntry[]> {
		const { cliType, acpId } = SessionManager.fromCanonical(canonicalId);

		const session = this.findSession(canonicalId);
		let cwd: string;
		if (session) {
			cwd = await this.resolveProjectPath(session.projectId);
		} else if (projectId) {
			// Discovered session — not in local metadata yet.
			// Adopt it into local metadata so future operations work.
			cwd = await this.resolveProjectPath(projectId);
			const now = new Date().toISOString();
			this.sessions.push({
				id: canonicalId,
				projectId,
				cliType,
				archived: false,
				title: `Session ${acpId.substring(0, 8)}`,
				lastActiveAt: now,
				createdAt: now,
			});
			await this.store.writeSync(this.sessions);
		} else {
			throw new Error("Session not found");
		}

		if (cliType === "claude-code" && this.claudeProvider) {
			const history = await loadClaudeSessionHistory(cwd, acpId);
			for (const entry of history) {
				onReplayEntry?.(entry);
			}
			void this.ensureClaudeSessionInitialized(canonicalId, acpId, cwd).catch(
				() => undefined,
			);
			return history;
		}

		const client = await this.agentManager.ensureAgent(cliType);
		return client.sessionLoad(acpId, cwd, onReplayEntry);
	}

	/** List sessions for a project.
	 *  Merges Builder-created sessions (from local metadata) with
	 *  sessions discovered from CLI filesystem storage (Claude Code + Codex).
	 *  Filters out archived sessions. Sorts by lastActiveAt descending. */
	async listSessions(projectId: string): Promise<SessionListItem[]> {
		const localSessions = this.sessions
			.filter((session) => session.projectId === projectId)
			.filter((session) => session.archived !== true)
			.map((session) => ({
				id: session.id,
				title: session.title,
				lastActiveAt: session.lastActiveAt,
				cliType: session.cliType,
			}));

		// Discover sessions from CLI filesystem storage
		let discoveredSessions: SessionListItem[] = [];
		try {
			const projectPath = await this.resolveProjectPath(projectId);
			discoveredSessions = await discoverAllSessions(projectPath);
		} catch {
			// Project path resolution failed — return local-only
		}

		// Merge: local metadata wins over discovered (by canonical ID)
		const localIds = new Set(localSessions.map((s) => s.id));
		const archivedIds = new Set(
			this.sessions.filter((s) => s.archived === true).map((s) => s.id),
		);
		const merged = [
			...localSessions,
			...discoveredSessions.filter(
				(s) => !localIds.has(s.id) && !archivedIds.has(s.id),
			),
		];

		merged.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
		return merged;
	}

	/** Archive a session (local operation) */
	archiveSession(canonicalId: string): void {
		const session = this.findSession(canonicalId);
		if (!session) {
			throw new Error("Session not found");
		}

		session.archived = true;
		this.store.writeSyncBlocking(this.sessions);
	}

	/** Send message to session via ACP session/prompt.
	 *  Updates title (from first user message) and lastActiveAt (on send).
	 *  Also updates lastActiveAt when agent response completes (on receive).
	 *  onEvent fires for each streaming update. */
	async sendMessage(
		canonicalId: string,
		content: string,
		onEvent: (event: AcpUpdateEvent) => void,
	): Promise<SessionPromptResult> {
		const session = this.findSession(canonicalId);
		if (!session) {
			throw new Error("Session not found");
		}

		const { cliType, acpId } = SessionManager.fromCanonical(canonicalId);
		let titleUpdated: string | undefined;

		if (session.title === "New Session") {
			titleUpdated = this.deriveTitle(content);
			session.title = titleUpdated;
			await this.store.writeSync(this.sessions);
		}

		session.lastActiveAt = new Date().toISOString();
		await this.store.writeSync(this.sessions);

		const promptResult =
			cliType === "claude-code" && this.claudeProvider
				? await (async () => {
						const projectDir = await this.resolveProjectPath(session.projectId);
						await this.ensureClaudeSessionInitialized(
							canonicalId,
							acpId,
							projectDir,
						);
						return this.sendClaudeProviderMessage(
							canonicalId,
							acpId,
							content,
							onEvent,
						);
					})()
				: await (async () => {
						const client = await this.agentManager.ensureAgent(cliType);
						return client.sessionPrompt(acpId, content, onEvent);
					})();

		session.lastActiveAt = new Date().toISOString();
		await this.store.writeSync(this.sessions);

		return {
			...promptResult,
			titleUpdated,
		};
	}

	/** Cancel an in-flight turn for a session. */
	async cancelTurn(canonicalId: string): Promise<void> {
		const { cliType, acpId } = SessionManager.fromCanonical(canonicalId);
		if (cliType === "claude-code" && this.claudeProvider) {
			await this.claudeProvider.cancelTurn(acpId);
			return;
		}
		const client = await this.agentManager.ensureAgent(cliType);
		client.sessionCancel(acpId);
	}

	/** Update session title (e.g., derived from first user message) */
	updateTitle(canonicalId: string, title: string): void {
		const session = this.findSession(canonicalId);
		if (!session) {
			throw new Error("Session not found");
		}

		session.title = title;
		this.store.writeSyncBlocking(this.sessions);
	}

	/** Convert cliType + acpId to canonical ID. */
	static toCanonical(cliType: CliType, acpId: string): string {
		return `${cliType}:${acpId}`;
	}

	/** Parse canonical ID into cliType + acpId. */
	static fromCanonical(canonicalId: string): {
		cliType: CliType;
		acpId: string;
	} {
		const colonIdx = canonicalId.indexOf(":");
		if (colonIdx === -1) {
			throw new Error(`Invalid canonical ID (no colon): ${canonicalId}`);
		}
		const cliType = canonicalId.substring(0, colonIdx);
		if (!VALID_CLI_TYPES.has(cliType)) {
			throw new Error(`Invalid CLI type in canonical ID: ${cliType}`);
		}
		return {
			cliType: cliType as CliType,
			acpId: canonicalId.substring(colonIdx + 1),
		};
	}

	private findSession(canonicalId: string): SessionMeta | undefined {
		return this.sessions.find((session) => session.id === canonicalId);
	}

	private async resolveProjectPath(projectId: string): Promise<string> {
		const projects = await this.projectStore.listProjects();
		const project = projects.find((candidate) => candidate.id === projectId);
		if (!project) {
			throw new Error("Project not found");
		}
		return project.path;
	}

	private deriveTitle(content: string): string {
		const maxLen = 50;
		const trimmed = content.trim();
		if (trimmed.length <= maxLen) {
			return trimmed;
		}

		const truncated = trimmed.substring(0, maxLen);
		const lastSpace = truncated.lastIndexOf(" ");
		if (lastSpace > 20) {
			return `${truncated.substring(0, lastSpace)}...`;
		}
		return `${truncated}...`;
	}

	private ensureClaudeRuntime(
		canonicalId: string,
		providerSessionId: string,
	): ClaudeSessionRuntime {
		const provider = this.requireClaudeProvider();
		const existing = this.claudeRuntimeByCanonicalId.get(canonicalId);
		const runtime: ClaudeSessionRuntime = existing ?? {
			providerSessionId,
			listenersAttached: false,
			pendingByTurnId: new Map<string, PendingClaudePrompt>(),
			bufferedUpsertsByTurnId: new Map<string, UpsertObject[]>(),
			bufferedTerminalByTurnId: new Map<
				string,
				Extract<TurnEvent, { type: "turn_complete" | "turn_error" }>
			>(),
		};
		runtime.providerSessionId = providerSessionId;
		this.claudeRuntimeByCanonicalId.set(canonicalId, runtime);

		if (!runtime.listenersAttached) {
			provider.onUpsert(providerSessionId, (upsert) => {
				this.handleClaudeUpsert(canonicalId, upsert);
			});
			provider.onTurn(providerSessionId, (event) => {
				this.handleClaudeTurn(canonicalId, event);
			});
			runtime.listenersAttached = true;
		}

		return runtime;
	}

	private ensureClaudeSessionInitialized(
		canonicalId: string,
		providerSessionId: string,
		projectDir: string,
	): Promise<ClaudeSessionRuntime> {
		const existingInit = this.claudeInitByCanonicalId.get(canonicalId);
		if (existingInit) {
			return existingInit;
		}

		const initPromise = (async () => {
			const provider = this.requireClaudeProvider();
			const viewFilePath = join(projectDir, ".liminal-builder-session-anchor");
			await this.withTimeout(
				provider.loadSession(providerSessionId, { viewFilePath }),
				CLAUDE_LOAD_TIMEOUT_MS,
				`Timed out loading Claude session ${providerSessionId}`,
			);
			return this.ensureClaudeRuntime(canonicalId, providerSessionId);
		})()
			.catch((error: unknown) => {
				const message =
					error instanceof Error
						? error.message
						: "Failed to load Claude session";
				throw new Error(message);
			})
			.finally(() => {
				this.claudeInitByCanonicalId.delete(canonicalId);
			});

		this.claudeInitByCanonicalId.set(canonicalId, initPromise);
		return initPromise;
	}

	private async withTimeout<T>(
		promise: Promise<T>,
		timeoutMs: number,
		errorMessage: string,
	): Promise<T> {
		let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutHandle = setTimeout(() => {
				reject(new Error(errorMessage));
			}, timeoutMs);
		});

		try {
			return await Promise.race([promise, timeoutPromise]);
		} finally {
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
		}
	}

	private async sendClaudeProviderMessage(
		canonicalId: string,
		providerSessionId: string,
		content: string,
		onEvent: (event: AcpUpdateEvent) => void,
	): Promise<SessionPromptResult> {
		const provider = this.requireClaudeProvider();
		const runtime = this.ensureClaudeRuntime(canonicalId, providerSessionId);
		const sendResult = await provider.sendMessage(providerSessionId, content);
		const { turnId } = sendResult;

		return await new Promise<SessionPromptResult>((resolve, reject) => {
			const pending: PendingClaudePrompt = {
				onEvent,
				resolve,
				reject,
				itemContentByItemId: new Map<string, string>(),
			};
			runtime.pendingByTurnId.set(turnId, pending);
			this.flushBufferedClaudeEvents(runtime, turnId);
		});
	}

	private flushBufferedClaudeEvents(
		runtime: ClaudeSessionRuntime,
		turnId: string,
	): void {
		const pending = runtime.pendingByTurnId.get(turnId);
		if (!pending) {
			return;
		}

		const bufferedUpserts = runtime.bufferedUpsertsByTurnId.get(turnId) ?? [];
		runtime.bufferedUpsertsByTurnId.delete(turnId);
		for (const upsert of bufferedUpserts) {
			this.forwardClaudeUpsert(pending, upsert);
		}

		const bufferedTerminal = runtime.bufferedTerminalByTurnId.get(turnId);
		if (bufferedTerminal) {
			runtime.bufferedTerminalByTurnId.delete(turnId);
			this.resolveClaudeTurn(runtime, turnId, bufferedTerminal);
		}
	}

	private handleClaudeUpsert(canonicalId: string, upsert: UpsertObject): void {
		const runtime = this.claudeRuntimeByCanonicalId.get(canonicalId);
		if (!runtime) {
			return;
		}
		const pending = runtime.pendingByTurnId.get(upsert.turnId);
		if (pending) {
			this.forwardClaudeUpsert(pending, upsert);
			return;
		}
		const buffered = runtime.bufferedUpsertsByTurnId.get(upsert.turnId) ?? [];
		buffered.push(upsert);
		runtime.bufferedUpsertsByTurnId.set(upsert.turnId, buffered);
	}

	private handleClaudeTurn(canonicalId: string, event: TurnEvent): void {
		if (event.type !== "turn_complete" && event.type !== "turn_error") {
			return;
		}
		const runtime = this.claudeRuntimeByCanonicalId.get(canonicalId);
		if (!runtime) {
			return;
		}
		const pending = runtime.pendingByTurnId.get(event.turnId);
		if (pending) {
			this.resolveClaudeTurn(runtime, event.turnId, event);
			return;
		}
		runtime.bufferedTerminalByTurnId.set(event.turnId, event);
	}

	private resolveClaudeTurn(
		runtime: ClaudeSessionRuntime,
		turnId: string,
		event: Extract<TurnEvent, { type: "turn_complete" | "turn_error" }>,
	): void {
		const pending = runtime.pendingByTurnId.get(turnId);
		if (!pending) {
			return;
		}
		runtime.pendingByTurnId.delete(turnId);
		if (event.type === "turn_error") {
			pending.reject(new Error(event.errorMessage));
			return;
		}
		pending.resolve({
			stopReason: event.status === "cancelled" ? "cancelled" : "end_turn",
		});
	}

	private forwardClaudeUpsert(
		pending: PendingClaudePrompt,
		upsert: UpsertObject,
	): void {
		for (const event of this.mapUpsertToAcpEvents(pending, upsert)) {
			pending.onEvent(event);
		}
	}

	private mapUpsertToAcpEvents(
		pending: PendingClaudePrompt,
		upsert: UpsertObject,
	): AcpUpdateEvent[] {
		if (upsert.type === "message" || upsert.type === "thinking") {
			const previous = pending.itemContentByItemId.get(upsert.itemId) ?? "";
			const next = upsert.content;
			const chunk = next.startsWith(previous)
				? next.slice(previous.length)
				: next;
			pending.itemContentByItemId.set(upsert.itemId, next);
			if (chunk.length === 0) {
				return [];
			}
			return [
				{
					type:
						upsert.type === "message"
							? "agent_message_chunk"
							: "agent_thought_chunk",
					content: [{ type: "text", text: chunk }],
				},
			];
		}

		const normalizedStatus =
			upsert.status === "create"
				? "pending"
				: upsert.status === "update"
					? "in_progress"
					: upsert.status === "error" || upsert.toolOutputIsError
						? "failed"
						: "completed";
		const toolContent =
			typeof upsert.toolOutput === "string" && upsert.toolOutput.length > 0
				? [{ type: "text" as const, text: upsert.toolOutput }]
				: undefined;

		if (upsert.status === "create") {
			return [
				{
					type: "tool_call",
					toolCallId: upsert.callId,
					title: upsert.toolName,
					status: normalizedStatus,
					...(toolContent ? { content: toolContent } : {}),
				},
			];
		}

		return [
			{
				type: "tool_call_update",
				toolCallId: upsert.callId,
				status: normalizedStatus,
				...(toolContent ? { content: toolContent } : {}),
			},
		];
	}

	private requireClaudeProvider(): CliProvider {
		if (!this.claudeProvider) {
			throw new Error("Claude provider is not configured");
		}
		return this.claudeProvider;
	}
}
