import {
	addOptimisticUserEntry,
	applyTurnEvent,
	applyUpsert,
	applyUpsertHistory,
	createEmptySessionState,
} from "@renderer/lib/chat-state";
import type {
	SessionRenderState,
	SessionSelection,
	SessionWorkspaceView,
	SessionListItem,
	TurnEvent,
	UpsertObject,
} from "@renderer/lib/types";

export function withSessionState(
	current: Record<string, SessionRenderState>,
	sessionId: string,
): SessionRenderState {
	return current[sessionId] ?? createEmptySessionState();
}

export function setSessionLoading(
	current: Record<string, SessionRenderState>,
	sessionId: string,
): Record<string, SessionRenderState> {
	return {
		...current,
		[sessionId]: {
			...withSessionState(current, sessionId),
			isLoadingHistory: true,
			unread: false,
			errorMessage: null,
		},
	};
}

export function setSessionError(
	current: Record<string, SessionRenderState>,
	sessionId: string,
	message: string,
): Record<string, SessionRenderState> {
	return {
		...current,
		[sessionId]: {
			...withSessionState(current, sessionId),
			isLoadingHistory: false,
			isStreaming: false,
			errorMessage: message,
		},
	};
}

export function archiveWorkspaceSession(
	current: Record<string, SessionRenderState>,
	sessionId: string,
): Record<string, SessionRenderState> {
	const next = { ...current };
	delete next[sessionId];
	return next;
}

export function addOptimisticPrompt(
	current: Record<string, SessionRenderState>,
	sessionId: string,
	content: string,
): Record<string, SessionRenderState> {
	return {
		...current,
		[sessionId]: addOptimisticUserEntry(
			withSessionState(current, sessionId),
			content,
		),
	};
}

export function applyHistoryMessage(
	current: Record<string, SessionRenderState>,
	sessionId: string,
	entries: UpsertObject[],
	selectedSessionId: string | null,
): Record<string, SessionRenderState> {
	const nextState = applyUpsertHistory(
		withSessionState(current, sessionId),
		entries,
	);
	nextState.unread = selectedSessionId !== sessionId;
	return {
		...current,
		[sessionId]: nextState,
	};
}

export function applyUpsertMessage(
	current: Record<string, SessionRenderState>,
	sessionId: string,
	upsert: UpsertObject,
	selectedSessionId: string | null,
): Record<string, SessionRenderState> {
	const nextState = applyUpsert(withSessionState(current, sessionId), upsert);
	nextState.unread = selectedSessionId !== sessionId;
	return {
		...current,
		[sessionId]: nextState,
	};
}

export function applyTurnMessage(
	current: Record<string, SessionRenderState>,
	sessionId: string,
	event: TurnEvent,
	selectedSessionId: string | null,
): Record<string, SessionRenderState> {
	const nextState = applyTurnEvent(withSessionState(current, sessionId), event);
	nextState.unread = selectedSessionId !== sessionId && nextState.unread;
	return {
		...current,
		[sessionId]: nextState,
	};
}

export function buildSessionUiById(
	sessionStates: Record<string, SessionRenderState>,
): Record<string, { unread: boolean; isStreaming: boolean }> {
	const next: Record<string, { unread: boolean; isStreaming: boolean }> = {};
	for (const [sessionId, state] of Object.entries(sessionStates)) {
		next[sessionId] = {
			unread: state.unread,
			isStreaming: state.isStreaming,
		};
	}
	return next;
}

export function buildWorkspaceView(params: {
	selection: SessionSelection | null;
	sessionsByProject: Record<string, SessionListItem[]>;
	sessionStates: Record<string, SessionRenderState>;
}): SessionWorkspaceView | null {
	const selection = params.selection;
	if (!selection) {
		return null;
	}

	const session = params.sessionsByProject[selection.projectId]?.find(
		(candidate) => candidate.id === selection.sessionId,
	);
	if (!session) {
		return null;
	}

	const renderState = withSessionState(params.sessionStates, session.id);
	const status =
		session.availability !== "available"
			? "unavailable"
			: renderState.errorMessage
				? "error"
				: renderState.isLoadingHistory
					? "loading_history"
					: "ready";

	return {
		sessionId: session.id,
		projectId: session.projectId,
		title: session.title,
		availability: session.availability,
		source: session.source,
		warningReason: session.warningReason,
		status,
		renderState,
	};
}
