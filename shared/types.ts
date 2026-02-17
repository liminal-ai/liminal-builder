import type { Project } from "../server/projects/project-types";
import type { CliType } from "../server/sessions/session-types";
import type {
	ConnectionCapabilities,
	StreamProtocolFamily,
	WsHistoryMessage,
	WsTurnMessage,
	WsUpsertMessage,
} from "./stream-contracts";

/** Chat entry types -- the UI representation of conversation content */
export type ChatEntry =
	| { entryId: string; type: "user"; content: string; timestamp: string }
	| { entryId: string; type: "assistant"; content: string; timestamp: string }
	| { entryId: string; type: "thinking"; content: string }
	| {
			entryId: string;
			type: "tool-call";
			toolCallId: string;
			name: string;
			status: "running" | "complete" | "error";
			result?: string;
			error?: string;
	  };

/**
 * Client -> Server WebSocket messages.
 * All messages include an optional requestId for correlating responses.
 */
export type ClientMessage = {
	requestId?: string;
} & (
	| { type: "session:open"; sessionId: string }
	| {
			type: "session:hello";
			streamProtocol?: "upsert-v1";
			capabilities?: ConnectionCapabilities;
	  }
	| { type: "session:create"; projectId: string; cliType: CliType }
	| { type: "session:send"; sessionId: string; content: string }
	| { type: "session:cancel"; sessionId: string }
	| { type: "session:archive"; sessionId: string }
	| { type: "session:reconnect"; cliType: CliType }
	| { type: "project:add"; path: string }
	| { type: "project:remove"; projectId: string }
	| { type: "project:list" }
	| { type: "session:list"; projectId: string }
);

/**
 * Server -> Client WebSocket messages.
 */
export type ServerMessage =
	| {
			type: "session:hello:ack";
			selectedFamily: StreamProtocolFamily;
	  }
	| WsUpsertMessage
	| WsTurnMessage
	| WsHistoryMessage
	| {
			type: "session:history";
			sessionId: string;
			entries: ChatEntry[];
			requestId?: string;
	  }
	| { type: "session:update"; sessionId: string; entry: ChatEntry }
	| {
			type: "session:chunk";
			sessionId: string;
			entryId: string;
			content: string;
	  }
	| { type: "session:complete"; sessionId: string; entryId: string }
	| {
			type: "session:created";
			sessionId: string;
			projectId: string;
			requestId?: string;
	  }
	| { type: "session:cancelled"; sessionId: string; entryId: string }
	| { type: "session:error"; sessionId: string; message: string }
	| { type: "session:archived"; sessionId: string; requestId?: string }
	| { type: "session:title-updated"; sessionId: string; title: string }
	| {
			type: "session:list";
			projectId: string;
			sessions: Array<{
				id: string;
				title: string;
				lastActiveAt: string;
				cliType: CliType;
			}>;
	  }
	| { type: "project:added"; project: Project; requestId?: string }
	| { type: "project:removed"; projectId: string; requestId?: string }
	| { type: "project:list"; projects: Project[] }
	| {
			type: "agent:status";
			cliType: CliType;
			status: "starting" | "connected" | "disconnected" | "reconnecting";
	  }
	| { type: "error"; requestId?: string; message: string };
