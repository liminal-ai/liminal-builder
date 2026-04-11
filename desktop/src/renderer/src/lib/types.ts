import type { Project } from "../../../../../server/projects/project-types";
import type {
	SessionAvailability,
	SessionListItem,
	SessionSource,
} from "../../../../../server/sessions/session-types";
import type { ClientMessage, ServerMessage } from "../../../../../shared/types";
import type {
	TurnEvent,
	UpsertObject,
} from "../../../../../server/streaming/upsert-types";

export type {
	Project,
	SessionListItem,
	ClientMessage,
	ServerMessage,
	TurnEvent,
	UpsertObject,
};

export type AgentStatus =
	| "starting"
	| "connected"
	| "disconnected"
	| "reconnecting";

export type RenderTurnBlock =
	| {
			blockId: string;
			type: "user-prompt";
			content: string;
			timestamp: string;
	  }
	| {
			blockId: string;
			type: "assistant-document";
			content: string;
			timestamp: string;
			finalized: boolean;
	  }
	| {
			blockId: string;
			type: "thinking";
			content: string;
	  }
	| {
			blockId: string;
			type: "tool-call";
			toolCallId: string;
			name: string;
			argumentsText?: string;
			status: "running" | "complete" | "error";
			result?: string;
			error?: string;
			outputFormat?: "plain" | "markdown" | "json" | "diff" | "code";
	  }
	| {
			blockId: string;
			type: "system-note";
			content: string;
			timestamp: string;
			tone: "notice" | "error";
	  };

export interface RenderTurn {
	turnId: string;
	turnOrder: number;
	timestamp: string;
	blocks: RenderTurnBlock[];
	isStreaming: boolean;
}

export interface OptimisticUserEntry {
	entryId: string;
	content: string;
	timestamp: string;
}

export interface SessionRenderState {
	turns: RenderTurn[];
	upsertsByItemId: Record<string, UpsertObject>;
	pendingOptimisticUserEntries: OptimisticUserEntry[];
	isLoadingHistory: boolean;
	isStreaming: boolean;
	unread: boolean;
	errorMessage: string | null;
}

export interface WsConnectionState {
	socketState: "connecting" | "connected" | "disconnected" | "reconnecting";
}

export interface SessionSelection {
	sessionId: string;
	projectId: string;
	availability: SessionAvailability;
	source: SessionSource;
	warningReason?: string;
}

export interface SessionWorkspaceView {
	sessionId: string;
	projectId: string;
	title: string;
	availability: SessionAvailability;
	source: SessionSource;
	warningReason?: string;
	status: "idle" | "loading_history" | "ready" | "unavailable" | "error";
	renderState: SessionRenderState;
}
