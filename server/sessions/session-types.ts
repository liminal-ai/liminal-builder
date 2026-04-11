import type { TurnEvent, UpsertObject } from "../streaming/upsert-types";
import type {
	CreateSessionOptions,
	LoadSessionOptions,
	ProviderSession,
} from "../providers/provider-types";

/**
 * Local metadata for a session.
 * ACP has no session/list -- we own ALL session metadata.
 * The agent only provides conversation content (via session/load replay).
 *
 * Used by: session services, websocket handlers
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
	/** Builder-local provenance for metadata persisted by the registry. */
	source?: "builder" | "adopted";
	/** Raw provider session identifier, when persisted explicitly. */
	providerSessionId?: string;
	/** Session title -- derived from first user message, or "New Session" initially */
	title: string;
	/** ISO 8601 UTC -- last message activity. Updated on send/receive (not on open). */
	lastActiveAt: string;
	/** ISO 8601 UTC -- when session was created */
	createdAt: string;
}

export type SessionSource = "builder" | "discovered" | "adopted";

export type SessionAvailability = "available" | "stale" | "missing";

export interface DiscoveredSession {
	/** Canonical session ID */
	id: string;
	cliType: CliType;
	/** Raw provider session identifier */
	providerSessionId: string;
	/** Session title */
	title: string;
	/** ISO 8601 UTC */
	lastActiveAt: string;
}

/** Session data for client display with provenance and availability. */
export interface SessionListItem extends DiscoveredSession {
	/** Parent project ID */
	projectId: string;
	/** Listing provenance */
	source: SessionSource;
	/** Whether the route can open this session immediately */
	availability: SessionAvailability;
	/** Optional reason for degraded availability */
	warningReason?: string;
}

export interface SessionOpenResult {
	sessionId: string;
	projectId: string;
	cliType: CliType;
	source: SessionSource;
	availability: SessionAvailability;
	providerSessionId: string;
	history: UpsertObject[];
	warningReason?: string;
}

export type SessionOpenFailureReason =
	| "missing_project"
	| "session_not_found"
	| "stale_local_session"
	| "missing_provider_file"
	| "provider_attach_failed"
	| "compatibility_only_fallback";

export class SessionOpenError extends Error {
	constructor(
		public readonly reason: SessionOpenFailureReason,
		message: string,
		public readonly sessionId: string,
		public readonly projectId?: string,
	) {
		super(message);
		this.name = "SessionOpenError";
	}
}

export type CliType = "claude-code" | "codex";

/** Valid CLI type values for runtime validation */
export const VALID_CLI_TYPES: ReadonlySet<string> = new Set([
	"claude-code",
	"codex",
]);

/** Prompt result plus any Builder-local title update derived during send. */
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

export interface CanonicalStreamCallbacks {
	onUpsert: (upsert: UpsertObject) => void;
	onTurn: (event: TurnEvent) => void;
}

export interface SessionRegistryPort {
	listAll(): SessionMeta[];
	listByProject(projectId: string): SessionMeta[];
	get(canonicalId: string): SessionMeta | undefined;
	create(meta: SessionMeta): Promise<SessionMeta>;
	adopt(meta: SessionMeta): Promise<SessionMeta>;
	update(
		canonicalId: string,
		updater: (session: SessionMeta) => SessionMeta,
	): Promise<SessionMeta>;
	updateSyncBlocking(
		canonicalId: string,
		updater: (session: SessionMeta) => SessionMeta,
	): SessionMeta;
	archive(canonicalId: string): SessionMeta;
}

export interface SessionDiscoveryPort {
	listProjectSessions(projectPath: string): Promise<DiscoveredSession[]>;
	findProjectSession(
		projectPath: string,
		canonicalId: string,
	): Promise<DiscoveredSession | undefined>;
	getAvailability(
		projectPath: string,
		cliType: CliType,
		providerSessionId: string,
	): Promise<SessionAvailability>;
}

export interface ProviderRuntimePort {
	createSession(options: CreateSessionOptions): Promise<ProviderSession>;
	loadSession(
		canonicalId: string,
		providerSessionId: string,
		projectDir: string,
		options?: LoadSessionOptions,
	): Promise<void>;
	sendMessage(
		canonicalId: string,
		providerSessionId: string,
		message: string,
		callbacks: CanonicalStreamCallbacks,
	): Promise<SessionPromptResult>;
	cancelTurn(providerSessionId: string): Promise<void>;
	supports(cliType: CliType): boolean;
}

export interface CanonicalHistoryStorePort {
	getHistory(sessionId: string): UpsertObject[];
	replaceHistory(
		sessionId: string,
		cliType: CliType,
		upserts: UpsertObject[],
	): UpsertObject[];
	recordUpsert(
		cliType: CliType,
		sessionId: string,
		upsert: UpsertObject,
	): UpsertObject;
}
