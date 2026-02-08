import { NotImplementedError } from "../errors";
import type { JsonStore } from "../store/json-store";
import type { SessionMeta, SessionListItem, CliType } from "./session-types";
import type { AgentManager } from "../acp/agent-manager";
import type { AcpUpdateEvent, AcpPromptResult } from "../acp/acp-types";
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
		this.sessions = [];
		void this.store.read().then((sessions) => {
			this.sessions = sessions;
		});
	}

	/** Create session via ACP session/new and record local metadata.
	 *  Title defaults to "New Session" until first user message. */
	async createSession(_projectId: string, _cliType: CliType): Promise<string> {
		void this.agentManager;
		void this.projectStore;
		void this.sessions;
		throw new NotImplementedError("SessionManager.createSession");
	}

	/** Open session via ACP session/load, collect replayed history.
	 *  Does NOT update lastActiveAt (only message send/receive updates it). */
	async openSession(_canonicalId: string): Promise<ChatEntry[]> {
		void this.agentManager;
		void this.projectStore;
		void this.sessions;
		throw new NotImplementedError("SessionManager.openSession");
	}

	/** List sessions for a project (entirely from local metadata).
	 *  Filters out archived sessions. Sorts by lastActiveAt descending. */
	listSessions(_projectId: string): SessionListItem[] {
		void this.sessions;
		throw new NotImplementedError("SessionManager.listSessions");
	}

	/** Archive a session (local operation) */
	archiveSession(_canonicalId: string): void {
		void this.sessions;
		throw new NotImplementedError("SessionManager.archiveSession");
	}

	/** Send message to session via ACP session/prompt.
	 *  Updates title (from first user message) and lastActiveAt (on send).
	 *  Also updates lastActiveAt when agent response completes (on receive).
	 *  onEvent fires for each streaming update. */
	async sendMessage(
		_canonicalId: string,
		_content: string,
		_onEvent: (event: AcpUpdateEvent) => void,
	): Promise<AcpPromptResult> {
		void this.agentManager;
		void this.sessions;
		throw new NotImplementedError("SessionManager.sendMessage");
	}

	/** Update session title (e.g., derived from first user message) */
	updateTitle(_canonicalId: string, _title: string): void {
		void this.sessions;
		throw new NotImplementedError("SessionManager.updateTitle");
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
		return {
			cliType: canonicalId.substring(0, colonIdx) as CliType,
			acpId: canonicalId.substring(colonIdx + 1),
		};
	}
}
