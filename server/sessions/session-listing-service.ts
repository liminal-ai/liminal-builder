import type { ProjectStore } from "../projects/project-store";
import type { SessionTitleService } from "./session-title-service";
import type {
	DiscoveredSession,
	SessionAvailability,
	SessionDiscoveryPort,
	SessionListItem,
	SessionMeta,
	SessionRegistryPort,
	SessionSource,
} from "./session-types";

function providerSessionIdFromCanonical(canonicalId: string): string {
	const colonIndex = canonicalId.indexOf(":");
	return colonIndex >= 0 ? canonicalId.substring(colonIndex + 1) : canonicalId;
}

function pickMostRecentTimestamp(
	localTimestamp: string | undefined,
	discoveredTimestamp: string | undefined,
): string {
	if (!localTimestamp) {
		return discoveredTimestamp ?? new Date().toISOString();
	}
	if (!discoveredTimestamp) {
		return localTimestamp;
	}
	return localTimestamp >= discoveredTimestamp
		? localTimestamp
		: discoveredTimestamp;
}

function getWarningReason(
	availability: SessionAvailability,
	source: SessionSource,
	projectPathAvailable: boolean,
): string | undefined {
	if (!projectPathAvailable) {
		return "Project path is no longer available.";
	}
	if (availability === "stale") {
		return source === "discovered"
			? "Discovered session is no longer available."
			: "Builder metadata exists, but the provider session file is missing.";
	}
	if (availability === "missing") {
		return "Session is unavailable.";
	}
	return undefined;
}

export class SessionListingService {
	constructor(
		private readonly registry: SessionRegistryPort,
		private readonly discoveryService: SessionDiscoveryPort,
		private readonly projectStore: Pick<ProjectStore, "listProjects">,
		private readonly titleService: SessionTitleService,
	) {}

	async listSessions(projectId: string): Promise<SessionListItem[]> {
		this.titleService.reloadOverrides();
		const localSessions = this.registry
			.listByProject(projectId)
			.filter((session) => session.archived !== true);
		const archivedIds = new Set(
			this.registry
				.listByProject(projectId)
				.filter((session) => session.archived === true)
				.map((session) => session.id),
		);

		const projectPath = await this.resolveProjectPath(projectId);
		const discoveredSessions =
			projectPath !== null
				? await this.discoveryService.listProjectSessions(projectPath)
				: [];
		const discoveredById = new Map(
			discoveredSessions.map((session) => [session.id, session]),
		);
		const mergedIds = new Set<string>();

		for (const session of localSessions) {
			if (!archivedIds.has(session.id)) {
				mergedIds.add(session.id);
			}
		}
		for (const session of discoveredSessions) {
			if (!archivedIds.has(session.id)) {
				mergedIds.add(session.id);
			}
		}

		const merged: SessionListItem[] = [];
		for (const sessionId of mergedIds) {
			const local = localSessions.find(
				(candidate) => candidate.id === sessionId,
			);
			const discovered = discoveredById.get(sessionId);
			merged.push(
				await this.toListItem(projectId, projectPath, local, discovered),
			);
		}

		merged.sort((left, right) =>
			right.lastActiveAt.localeCompare(left.lastActiveAt),
		);
		return merged;
	}

	private async resolveProjectPath(projectId: string): Promise<string | null> {
		const projects = await this.projectStore.listProjects();
		const project = projects.find((candidate) => candidate.id === projectId);
		return project?.path ?? null;
	}

	private async toListItem(
		projectId: string,
		projectPath: string | null,
		local: SessionMeta | undefined,
		discovered: DiscoveredSession | undefined,
	): Promise<SessionListItem> {
		const sessionId = local?.id ?? discovered?.id ?? "unknown";
		const cliType = local?.cliType ?? discovered?.cliType ?? "claude-code";
		const source = local?.source ?? (discovered ? "discovered" : "builder");
		const providerSessionId =
			discovered?.providerSessionId ??
			local?.providerSessionId ??
			providerSessionIdFromCanonical(sessionId);
		const availability =
			discovered !== undefined
				? "available"
				: projectPath === null
					? "missing"
					: await this.discoveryService.getAvailability(
							projectPath,
							cliType,
							providerSessionId,
						);
		const fallbackTitle =
			local?.title ??
			discovered?.title ??
			`Session ${providerSessionId.substring(0, 8)}`;

		return {
			id: sessionId,
			projectId,
			cliType,
			providerSessionId,
			source,
			availability,
			title: this.titleService.applyTitle(sessionId, fallbackTitle),
			lastActiveAt: pickMostRecentTimestamp(
				local?.lastActiveAt,
				discovered?.lastActiveAt,
			),
			warningReason: getWarningReason(
				availability,
				source,
				projectPath !== null,
			),
		};
	}
}
