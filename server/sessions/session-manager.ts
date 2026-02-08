import type { JsonStore } from "../store/json-store";
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

	constructor(
		private readonly store: JsonStore<SessionMeta[]>,
		private readonly agentManager: AgentManager,
		private readonly projectStore: ProjectStore,
	) {
		this.sessions = this.store.readSync();
	}

	/** Create session via ACP session/new and record local metadata.
	 *  Title defaults to "New Session" until first user message. */
	async createSession(projectId: string, cliType: CliType): Promise<string> {
		const cwd = await this.resolveProjectPath(projectId);
		const client = await this.agentManager.ensureAgent(cliType);
		const { sessionId: acpId } = await client.sessionNew({ cwd });
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

		return canonicalId;
	}

	/** Open session via ACP session/load, collect replayed history.
	 *  Does NOT update lastActiveAt (only message send/receive updates it). */
	async openSession(canonicalId: string): Promise<ChatEntry[]> {
		const session = this.findSession(canonicalId);
		if (!session) {
			throw new Error("Session not found");
		}

		const { cliType, acpId } = SessionManager.fromCanonical(canonicalId);
		const client = await this.agentManager.ensureAgent(cliType);
		const cwd = await this.resolveProjectPath(session.projectId);

		return client.sessionLoad(acpId, cwd);
	}

	/** List sessions for a project (entirely from local metadata).
	 *  Filters out archived sessions. Sorts by lastActiveAt descending. */
	listSessions(projectId: string): SessionListItem[] {
		return this.sessions
			.filter((session) => session.projectId === projectId)
			.filter((session) => session.archived !== true)
			.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
			.map((session) => ({
				id: session.id,
				title: session.title,
				lastActiveAt: session.lastActiveAt,
				cliType: session.cliType,
			}));
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

		const client = await this.agentManager.ensureAgent(cliType);
		const promptResult = await client.sessionPrompt(acpId, content, onEvent);

		session.lastActiveAt = new Date().toISOString();
		await this.store.writeSync(this.sessions);

		return {
			...promptResult,
			titleUpdated,
		};
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
}
