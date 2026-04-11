import {
	claudeSessionFileExists,
	discoverAllSessions,
} from "./session-discovery";
import type {
	CliType,
	DiscoveredSession,
	SessionAvailability,
	SessionDiscoveryPort,
} from "./session-types";

export class SessionDiscoveryService implements SessionDiscoveryPort {
	async listProjectSessions(projectPath: string): Promise<DiscoveredSession[]> {
		return discoverAllSessions(projectPath);
	}

	async findProjectSession(
		projectPath: string,
		canonicalId: string,
	): Promise<DiscoveredSession | undefined> {
		const sessions = await this.listProjectSessions(projectPath);
		return sessions.find((session) => session.id === canonicalId);
	}

	async getAvailability(
		projectPath: string,
		cliType: CliType,
		providerSessionId: string,
	): Promise<SessionAvailability> {
		if (cliType === "claude-code") {
			return (await claudeSessionFileExists(projectPath, providerSessionId))
				? "available"
				: "stale";
		}
		return "available";
	}
}
