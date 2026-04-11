import type { ClientMessage } from "../../shared/types";

export function isClientMessage(value: unknown): value is ClientMessage {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	if (typeof candidate.type !== "string") {
		return false;
	}

	switch (candidate.type) {
		case "project:add":
			return typeof candidate.path === "string";
		case "project:remove":
			return typeof candidate.projectId === "string";
		case "project:list":
			return true;
		case "session:open":
		case "session:cancel":
		case "session:archive":
			return typeof candidate.sessionId === "string";
		case "session:create":
			return (
				typeof candidate.projectId === "string" &&
				(candidate.cliType === "claude-code" || candidate.cliType === "codex")
			);
		case "session:send":
			return (
				typeof candidate.sessionId === "string" &&
				typeof candidate.content === "string"
			);
		case "session:reconnect":
			return (
				candidate.cliType === "claude-code" || candidate.cliType === "codex"
			);
		case "session:list":
			return typeof candidate.projectId === "string";
		default:
			return false;
	}
}
