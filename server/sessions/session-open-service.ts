import type { ProjectStore } from "../projects/project-store";
import type {
	CanonicalHistoryStorePort,
	ProviderRuntimePort,
	SessionAvailability,
	SessionDiscoveryPort,
	SessionMeta,
	SessionOpenResult,
	SessionRegistryPort,
	SessionSource,
} from "./session-types";
import { SessionOpenError as SessionOpenServiceError } from "./session-types";
import { loadClaudeSessionHistoryUpserts } from "./claude-session-history";

function providerSessionIdFromCanonical(canonicalId: string): string {
	const colonIndex = canonicalId.indexOf(":");
	return colonIndex >= 0 ? canonicalId.substring(colonIndex + 1) : canonicalId;
}

function warningReasonForAvailability(
	availability: SessionAvailability,
): string | undefined {
	if (availability === "stale") {
		return "Session metadata exists, but the provider session file is missing.";
	}
	if (availability === "missing") {
		return "Session is unavailable.";
	}
	return undefined;
}

export class SessionOpenService {
	constructor(
		private readonly registry: SessionRegistryPort,
		private readonly discoveryService: SessionDiscoveryPort,
		private readonly projectStore: Pick<ProjectStore, "listProjects">,
		private readonly runtime: ProviderRuntimePort,
		private readonly canonicalHistoryStore?: CanonicalHistoryStorePort,
	) {}

	async openSession(
		canonicalId: string,
		projectId?: string,
	): Promise<SessionOpenResult> {
		const local = this.registry.get(canonicalId);
		const cliType = local?.cliType ?? this.cliTypeFromCanonical(canonicalId);
		const resolvedProjectId = projectId ?? local?.projectId;
		if (!resolvedProjectId) {
			throw new SessionOpenServiceError(
				"missing_project",
				"Project ID is required to open this session",
				canonicalId,
			);
		}
		const projectDir = await this.resolveProjectPath(resolvedProjectId);
		const discovered = await this.discoveryService.findProjectSession(
			projectDir,
			canonicalId,
		);
		const providerSessionId =
			discovered?.providerSessionId ??
			local?.providerSessionId ??
			providerSessionIdFromCanonical(canonicalId);
		const persistedHistory =
			this.canonicalHistoryStore?.getHistory(canonicalId) ?? [];
		const availability =
			discovered !== undefined
				? "available"
				: await this.discoveryService.getAvailability(
						projectDir,
						cliType,
						providerSessionId,
					);

		if (!local && !discovered) {
			throw new SessionOpenServiceError(
				"session_not_found",
				"Session not found",
				canonicalId,
				resolvedProjectId,
			);
		}

		if (
			local &&
			availability !== "available" &&
			this.runtime.supports(cliType) &&
			persistedHistory.length === 0
		) {
			throw new SessionOpenServiceError(
				availability === "stale"
					? "stale_local_session"
					: "missing_provider_file",
				warningReasonForAvailability(availability) ?? "Session is unavailable.",
				canonicalId,
				resolvedProjectId,
			);
		}

		let source: SessionSource =
			local?.source ?? (discovered ? "discovered" : "builder");
		if (!local && discovered) {
			source = "adopted";
			await this.registry.adopt({
				id: canonicalId,
				projectId: resolvedProjectId,
				cliType,
				archived: false,
				source: "adopted",
				providerSessionId,
				title: discovered.title,
				lastActiveAt: discovered.lastActiveAt,
				createdAt: discovered.lastActiveAt,
			});
		}

		const history =
			availability !== "available" && persistedHistory.length > 0
				? persistedHistory
				: await this.loadHistory(
						canonicalId,
						cliType,
						providerSessionId,
						projectDir,
					);

		return {
			sessionId: canonicalId,
			projectId: resolvedProjectId,
			cliType,
			source,
			availability,
			providerSessionId,
			history,
			warningReason: warningReasonForAvailability(availability),
		};
	}

	private async loadHistory(
		canonicalId: string,
		cliType: SessionMeta["cliType"],
		providerSessionId: string,
		projectDir: string,
	): Promise<SessionOpenResult["history"]> {
		if (!this.runtime.supports(cliType)) {
			throw new SessionOpenServiceError(
				"compatibility_only_fallback",
				"Session requires the compatibility adapter",
				canonicalId,
			);
		}

		const persistedHistory =
			this.canonicalHistoryStore?.getHistory(canonicalId) ?? [];
		if (persistedHistory.length > 0) {
			void this.runtime
				.loadSession(canonicalId, providerSessionId, projectDir)
				.catch(() => undefined);
			return persistedHistory;
		}

		const history = await loadClaudeSessionHistoryUpserts(
			projectDir,
			providerSessionId,
			canonicalId,
		);
		if (history.length > 0) {
			const canonicalHistory =
				this.canonicalHistoryStore?.replaceHistory(
					canonicalId,
					cliType,
					history,
				) ?? history;
			void this.runtime
				.loadSession(canonicalId, providerSessionId, projectDir)
				.catch(() => undefined);
			return canonicalHistory;
		}

		try {
			await this.runtime.loadSession(
				canonicalId,
				providerSessionId,
				projectDir,
			);
			return [];
		} catch (error) {
			throw new SessionOpenServiceError(
				"provider_attach_failed",
				error instanceof Error
					? error.message
					: "Failed to attach to Claude session",
				canonicalId,
			);
		}
	}

	private cliTypeFromCanonical(canonicalId: string): SessionMeta["cliType"] {
		return canonicalId.startsWith("codex:") ? "codex" : "claude-code";
	}

	private async resolveProjectPath(projectId: string): Promise<string> {
		const projects = await this.projectStore.listProjects();
		const project = projects.find((candidate) => candidate.id === projectId);
		if (!project) {
			throw new SessionOpenServiceError(
				"missing_project",
				"Project not found",
				projectId,
				projectId,
			);
		}
		return project.path;
	}
}
