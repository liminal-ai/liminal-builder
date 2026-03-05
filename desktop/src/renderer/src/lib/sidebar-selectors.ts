import type { SessionListItem } from "./types";

export interface PinnedSessionViewModel {
  session: SessionListItem;
  projectId: string;
  projectName: string;
}

export function flattenProjectSessions(
  sessionsByProject: Record<string, SessionListItem[]>,
): Array<{ projectId: string; session: SessionListItem }> {
  const result: Array<{ projectId: string; session: SessionListItem }> = [];
  for (const [projectId, sessions] of Object.entries(sessionsByProject)) {
    for (const session of sessions) {
      result.push({ projectId, session });
    }
  }
  return result;
}

export function cleanupPinnedSessionIds(
  pinnedSessionIds: string[],
  sessionsByProject: Record<string, SessionListItem[]>,
): string[] {
  const allSessionIds = new Set(
    flattenProjectSessions(sessionsByProject).map((entry) => entry.session.id),
  );

  return pinnedSessionIds.filter((sessionId) => allSessionIds.has(sessionId));
}

export function buildPinnedSessionViewModels(
  pinnedSessionIds: string[],
  sessionsByProject: Record<string, SessionListItem[]>,
  projectNameById: Record<string, string>,
): PinnedSessionViewModel[] {
  const byId = new Map<string, { projectId: string; session: SessionListItem }>();

  for (const { projectId, session } of flattenProjectSessions(sessionsByProject)) {
    byId.set(session.id, { projectId, session });
  }

  const deduped = new Set<string>();
  const models: PinnedSessionViewModel[] = [];

  for (const pinnedSessionId of pinnedSessionIds) {
    if (deduped.has(pinnedSessionId)) {
      continue;
    }

    const value = byId.get(pinnedSessionId);
    if (!value) {
      continue;
    }

    deduped.add(pinnedSessionId);
    models.push({
      session: value.session,
      projectId: value.projectId,
      projectName: projectNameById[value.projectId] ?? value.projectId,
    });
  }

  return models;
}
