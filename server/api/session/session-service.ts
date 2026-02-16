import { NotImplementedError } from "../../errors";
import type { CliType } from "../../providers/provider-types";

export type SessionState = "open" | "loading" | "dead";

export interface SessionListItem {
	sessionId: string;
	cliType: CliType;
	projectId: string;
	status: SessionState;
}

export interface SessionStatus {
	sessionId: string;
	cliType: CliType;
	isAlive: boolean;
	state: SessionState;
}

export interface SessionService {
	createSession(input: {
		cliType: CliType;
		projectDir: string;
	}): Promise<{ sessionId: string; cliType: CliType }>;
	loadSession(input: {
		sessionId: string;
	}): Promise<{ sessionId: string; cliType: CliType }>;
	listSessions(input: {
		projectId: string;
	}): Promise<{ sessions: SessionListItem[] }>;
	getStatus(input: { sessionId: string }): Promise<SessionStatus>;
	sendMessage(input: { sessionId: string; content: string }): Promise<{
		turnId: string;
	}>;
	cancelTurn(input: { sessionId: string }): Promise<void>;
	killSession(input: { sessionId: string }): Promise<void>;
}

class NotImplementedSessionService implements SessionService {
	async createSession(_input: {
		cliType: CliType;
		projectDir: string;
	}): Promise<{ sessionId: string; cliType: CliType }> {
		throw new NotImplementedError("SessionService.createSession");
	}

	async loadSession(_input: {
		sessionId: string;
	}): Promise<{ sessionId: string; cliType: CliType }> {
		throw new NotImplementedError("SessionService.loadSession");
	}

	async listSessions(_input: { projectId: string }): Promise<{
		sessions: SessionListItem[];
	}> {
		throw new NotImplementedError("SessionService.listSessions");
	}

	async getStatus(_input: { sessionId: string }): Promise<SessionStatus> {
		throw new NotImplementedError("SessionService.getStatus");
	}

	async sendMessage(_input: {
		sessionId: string;
		content: string;
	}): Promise<{ turnId: string }> {
		throw new NotImplementedError("SessionService.sendMessage");
	}

	async cancelTurn(_input: { sessionId: string }): Promise<void> {
		throw new NotImplementedError("SessionService.cancelTurn");
	}

	async killSession(_input: { sessionId: string }): Promise<void> {
		throw new NotImplementedError("SessionService.killSession");
	}
}

export function createSessionService(): SessionService {
	return new NotImplementedSessionService();
}
