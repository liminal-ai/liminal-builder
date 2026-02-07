import { NotImplementedError } from "../errors";
import type { JsonStore } from "../store/json-store";
import type { SessionMeta, SessionListItem, CliType } from "./session-types";
import type { AgentManager } from "../acp/agent-manager";
import type { AcpUpdateEvent, AcpPromptResult } from "../acp/acp-types";
import type { ChatEntry } from "../../shared/types";

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
	constructor(
		public store: JsonStore<SessionMeta[]>,
		public agentManager: AgentManager,
	) {}

	/** Create session via ACP session/new and record local metadata. */
	async createSession(
		_projectId: string,
		_cliType: CliType,
		_projectPath: string,
	): Promise<string> {
		throw new NotImplementedError("SessionManager.createSession");
	}

	/** Open session via ACP session/load, collect replayed history. */
	async openSession(_canonicalId: string): Promise<ChatEntry[]> {
		throw new NotImplementedError("SessionManager.openSession");
	}

	/** List sessions for a project (entirely from local metadata). */
	listSessions(_projectId: string): SessionListItem[] {
		throw new NotImplementedError("SessionManager.listSessions");
	}

	/** Archive a session (local operation). */
	archiveSession(_canonicalId: string): void {
		throw new NotImplementedError("SessionManager.archiveSession");
	}

	/** Send message to session via ACP session/prompt. */
	async sendMessage(
		_canonicalId: string,
		_content: string,
		_onEvent: (event: AcpUpdateEvent) => void,
	): Promise<AcpPromptResult> {
		throw new NotImplementedError("SessionManager.sendMessage");
	}

	/** Update session title. */
	updateTitle(_canonicalId: string, _title: string): void {
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
		const colonIndex = canonicalId.indexOf(":");
		if (colonIndex === -1) {
			throw new Error(`Invalid canonical ID: ${canonicalId}`);
		}
		// The cliType may contain colons (e.g., "claude-code"), so we split on the LAST colon
		// Actually, cliType is "claude-code" or "codex" which use hyphens not colons.
		// So the first colon is always the delimiter.
		const cliType = canonicalId.substring(0, colonIndex) as CliType;
		const acpId = canonicalId.substring(colonIndex + 1);
		return { cliType, acpId };
	}
}
