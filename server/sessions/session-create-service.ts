import type { AgentManager } from "../acp/agent-manager";
import type { ProjectStore } from "../projects/project-store";
import type {
	CliType,
	ProviderRuntimePort,
	SessionMeta,
	SessionRegistryPort,
} from "./session-types";

function toCanonicalSessionId(
	cliType: CliType,
	providerSessionId: string,
): string {
	return `${cliType}:${providerSessionId}`;
}

export class SessionCreateService {
	constructor(
		private readonly registry: SessionRegistryPort,
		private readonly projectStore: Pick<ProjectStore, "listProjects">,
		private readonly agentManager: Pick<AgentManager, "ensureAgent">,
		private readonly runtime: ProviderRuntimePort,
	) {}

	async createSession(
		projectId: string,
		cliType: CliType,
	): Promise<SessionMeta> {
		const projectDir = await this.resolveProjectPath(projectId);
		const created = this.runtime.supports(cliType)
			? await this.runtime.createSession({ projectDir })
			: await this.createCompatibilitySession(cliType, projectDir);
		const canonicalId = toCanonicalSessionId(cliType, created.sessionId);
		const now = new Date().toISOString();

		return await this.registry.create({
			id: canonicalId,
			projectId,
			cliType,
			archived: false,
			source: "builder",
			providerSessionId: created.sessionId,
			title: "New Session",
			lastActiveAt: now,
			createdAt: now,
		});
	}

	private async createCompatibilitySession(
		cliType: CliType,
		projectDir: string,
	) {
		const client = await this.agentManager.ensureAgent(cliType);
		const result = await client.sessionNew({ cwd: projectDir });
		return {
			sessionId: result.sessionId,
			cliType,
		};
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
