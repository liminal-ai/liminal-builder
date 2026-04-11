import type { AgentManager } from "../acp/agent-manager";
import type { ProjectStore } from "../projects/project-store";
import type { CliProvider } from "../providers/provider-types";
import type { JsonStore } from "../store/json-store";
import type { CanonicalHistoryStore } from "../streaming/canonical-history-store";
import type {
	CanonicalStreamCallbacks,
	CliType,
	ProviderRuntimePort,
	SessionListItem,
	SessionMeta,
	SessionOpenResult,
	SessionPromptResult,
	SessionRegistryPort,
} from "./session-types";
import { ClaudeRuntimeCoordinator } from "./claude-runtime-coordinator";
import { ClaudeSessionMessageService } from "./claude-session-message-service";
import { SessionCreateService } from "./session-create-service";
import { SessionDiscoveryService } from "./session-discovery-service";
import { SessionListingService } from "./session-listing-service";
import { SessionOpenService } from "./session-open-service";
import { SessionRegistry } from "./session-registry";
import type { SessionTitleOverrideStore } from "./session-title-overrides";
import { SessionTitleService } from "./session-title-service";

export interface SessionCreatePort {
	createSession(projectId: string, cliType: CliType): Promise<SessionMeta>;
}

export interface SessionListingPort {
	listSessions(projectId: string): Promise<SessionListItem[]>;
}

export interface SessionOpenPort {
	openSession(
		canonicalId: string,
		projectId?: string,
	): Promise<SessionOpenResult>;
}

export interface SessionMessagePort {
	sendMessage(
		canonicalId: string,
		content: string,
		callbacks: CanonicalStreamCallbacks,
	): Promise<SessionPromptResult>;
	cancelTurn(canonicalId: string): Promise<void>;
}

export interface SessionTitlePort {
	reloadOverrides(): void;
	applyTitle(canonicalId: string, fallbackTitle: string): string;
	deriveTitle(content: string): string;
	maybeApplyInitialPromptTitle(
		session: SessionMeta,
		content: string,
	): SessionPromptResult["titleUpdated"];
	setManualTitle(canonicalId: string, title: string): void;
}

export interface BuilderSessionServices {
	registry: SessionRegistryPort;
	discovery: SessionDiscoveryService;
	title: SessionTitlePort;
	runtime: ProviderRuntimePort;
	create: SessionCreatePort;
	listing: SessionListingPort;
	open: SessionOpenPort;
	messages: SessionMessagePort;
}

interface CreateBuilderSessionServicesOptions {
	store: JsonStore<SessionMeta[]>;
	agentManager: AgentManager;
	projectStore: ProjectStore;
	claudeProvider?: CliProvider;
	canonicalHistoryStore?: CanonicalHistoryStore;
	titleOverrideStore?: SessionTitleOverrideStore;
}

export function createBuilderSessionServices(
	options: CreateBuilderSessionServicesOptions,
): BuilderSessionServices {
	const registry = new SessionRegistry(options.store);
	const discovery = new SessionDiscoveryService();
	const title = new SessionTitleService(options.titleOverrideStore);
	const runtime = new ClaudeRuntimeCoordinator(
		options.claudeProvider?.cliType === "claude-code"
			? options.claudeProvider
			: undefined,
		options.canonicalHistoryStore,
	);
	const create = new SessionCreateService(
		registry,
		options.projectStore,
		options.agentManager,
		runtime,
	);
	const listing = new SessionListingService(
		registry,
		discovery,
		options.projectStore,
		title,
	);
	const open = new SessionOpenService(
		registry,
		discovery,
		options.projectStore,
		runtime,
		options.canonicalHistoryStore,
	);
	const messages = new ClaudeSessionMessageService(
		registry,
		options.projectStore,
		runtime,
		title,
	);

	return {
		registry,
		discovery,
		title,
		runtime,
		create,
		listing,
		open,
		messages,
	};
}
