/**
 * Local metadata for a session.
 * ACP has no session/list -- we own ALL session metadata.
 * The agent only provides conversation content (via session/load replay).
 *
 * Used by: session-manager, websocket handler
 * Supports: AC-2.1 (listing), AC-2.4 (archive), AC-2.5 (persistence)
 */
export interface SessionMeta {
	/** Canonical ID: "{cliType}:{acpSessionId}" e.g., "claude-code:abc123" */
	id: string;
	/** Parent project ID */
	projectId: string;
	/** Which CLI type owns this session */
	cliType: CliType;
	/** Hidden from sidebar when true */
	archived: boolean;
	/** Session title -- derived from first user message, or "New Session" initially */
	title: string;
	/** ISO 8601 UTC -- last message activity. Updated on send/receive (not on open). */
	lastActiveAt: string;
	/** ISO 8601 UTC -- when session was created */
	createdAt: string;
}

/** Session data for client display (derived entirely from SessionMeta) */
export interface SessionListItem {
	/** Canonical session ID */
	id: string;
	/** Session title */
	title: string;
	/** ISO 8601 UTC */
	lastActiveAt: string;
	/** CLI type */
	cliType: CliType;
}

export type CliType = "claude-code" | "codex";

/** Valid CLI type values for runtime validation */
export const VALID_CLI_TYPES: ReadonlySet<string> = new Set([
	"claude-code",
	"codex",
]);

/** Result of SessionManager.sendMessage — extends AcpPromptResult with optional title update */
export interface SessionPromptResult {
	stopReason:
		| "end_turn"
		| "max_tokens"
		| "max_turn_requests"
		| "refusal"
		| "cancelled";
	/** Set when the session title was derived from the first user message */
	titleUpdated?: string;
}
