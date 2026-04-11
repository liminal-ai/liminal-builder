import type {
	Project,
	SessionListItem,
	SessionSelection,
} from "@renderer/lib/types";

export const STORAGE_KEYS = {
	collapsed: "lb:desktop:collapsed",
	sidebarWidth: "lb:desktop:sidebar-width",
	selectedSession: "lb:desktop:selected-session",
	selectedSessionProject: "lb:desktop:selected-session-project",
	pinnedSessions: "lb:desktop:pinned-sessions",
};

export function readStorage<T>(key: string, fallback: T): T {
	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) {
			return fallback;
		}
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

export function writeStorage<T>(key: string, value: T): void {
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Ignore storage failures.
	}
}

export function filterClaudeSessions(
	sessions: SessionListItem[],
): SessionListItem[] {
	return sessions.filter((session) => session.cliType === "claude-code");
}

export function ensureProjectSessionBuckets(
	prev: Record<string, SessionListItem[]>,
	projects: Project[],
): Record<string, SessionListItem[]> {
	const next: Record<string, SessionListItem[]> = {};
	for (const project of projects) {
		next[project.id] = prev[project.id] ?? [];
	}
	return next;
}

export function removeSessionFromLists(
	sessionsByProject: Record<string, SessionListItem[]>,
	sessionId: string,
): Record<string, SessionListItem[]> {
	const next: Record<string, SessionListItem[]> = {};
	for (const [projectId, sessions] of Object.entries(sessionsByProject)) {
		next[projectId] = sessions.filter((session) => session.id !== sessionId);
	}
	return next;
}

export function findSessionSelection(
	sessionsByProject: Record<string, SessionListItem[]>,
	sessionId: string,
	projectId?: string | null,
): SessionSelection | null {
	if (projectId) {
		const session = sessionsByProject[projectId]?.find(
			(candidate) => candidate.id === sessionId,
		);
		if (session) {
			return toSelection(session);
		}
	}

	for (const sessions of Object.values(sessionsByProject)) {
		const session = sessions.find((candidate) => candidate.id === sessionId);
		if (session) {
			return toSelection(session);
		}
	}

	return null;
}

export function toSelection(session: SessionListItem): SessionSelection {
	return {
		sessionId: session.id,
		projectId: session.projectId,
		availability: session.availability,
		source: session.source,
		warningReason: session.warningReason,
	};
}

export function buildProjectNameById(
	projects: Project[],
): Record<string, string> {
	const next: Record<string, string> = {};
	for (const project of projects) {
		next[project.id] = project.name;
	}
	return next;
}

export function buildProjectPathById(
	projects: Project[],
): Record<string, string> {
	const next: Record<string, string> = {};
	for (const project of projects) {
		next[project.id] = project.path;
	}
	return next;
}
