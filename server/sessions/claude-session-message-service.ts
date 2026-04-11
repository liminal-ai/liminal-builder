import type { ProjectStore } from "../projects/project-store";
import type {
	CanonicalStreamCallbacks,
	ProviderRuntimePort,
	SessionMeta,
	SessionPromptResult,
	SessionRegistryPort,
} from "./session-types";
import type { SessionTitleService } from "./session-title-service";

function providerSessionIdFromCanonical(canonicalId: string): string {
	const colonIndex = canonicalId.indexOf(":");
	return colonIndex >= 0 ? canonicalId.substring(colonIndex + 1) : canonicalId;
}

export class ClaudeSessionMessageService {
	constructor(
		private readonly registry: SessionRegistryPort,
		private readonly projectStore: Pick<ProjectStore, "listProjects">,
		private readonly runtime: ProviderRuntimePort,
		private readonly titleService: SessionTitleService,
	) {}

	async sendMessage(
		canonicalId: string,
		content: string,
		callbacks: CanonicalStreamCallbacks,
	): Promise<SessionPromptResult> {
		const session = this.requireSession(canonicalId);
		if (!this.runtime.supports(session.cliType)) {
			throw new Error(
				"Canonical streaming is only available for Claude sessions",
			);
		}

		const titleUpdated = this.titleService.maybeApplyInitialPromptTitle(
			session,
			content,
		);
		await this.registry.update(canonicalId, () => ({
			...session,
			lastActiveAt: new Date().toISOString(),
		}));

		const projectDir = await this.resolveProjectPath(session.projectId);
		const providerSessionId =
			session.providerSessionId ?? providerSessionIdFromCanonical(canonicalId);
		await this.runtime.loadSession(canonicalId, providerSessionId, projectDir);

		const promptResult = await this.runtime.sendMessage(
			canonicalId,
			providerSessionId,
			content,
			callbacks,
		);

		await this.registry.update(canonicalId, (current) => ({
			...current,
			lastActiveAt: new Date().toISOString(),
		}));

		return {
			...promptResult,
			titleUpdated,
		};
	}

	async cancelTurn(canonicalId: string): Promise<void> {
		const session = this.requireSession(canonicalId);
		const providerSessionId =
			session.providerSessionId ?? providerSessionIdFromCanonical(canonicalId);
		await this.runtime.cancelTurn(providerSessionId);
	}

	private requireSession(canonicalId: string): SessionMeta {
		const session = this.registry.get(canonicalId);
		if (!session) {
			throw new Error(`Session not found: ${canonicalId}`);
		}
		return session;
	}

	private async resolveProjectPath(projectId: string): Promise<string> {
		const projects = await this.projectStore.listProjects();
		const project = projects.find((candidate) => candidate.id === projectId);
		if (!project) {
			throw new Error("Project not found");
		}
		return project.path;
	}
}
