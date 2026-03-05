import type { SessionListItem } from "./types";

export function filterClaudeSessions(sessions: SessionListItem[]): SessionListItem[] {
  return sessions.filter((session) => session.cliType === "claude-code");
}
