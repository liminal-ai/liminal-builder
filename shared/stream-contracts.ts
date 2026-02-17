import type { UpsertObject, TurnEvent } from "@server/streaming/upsert-types";

// Types re-exported for client consumption
export type {
	FinalizedItem,
	Usage,
} from "@server/streaming/stream-event-schema";

export type {
	UpsertObject,
	MessageUpsert,
	ThinkingUpsert,
	ToolCallUpsert,
	TurnEvent,
} from "@server/streaming/upsert-types";

// -- WebSocket message types (Builder -> Browser) --
export interface WsUpsertMessage {
	type: "session:upsert";
	sessionId: string;
	payload: UpsertObject;
}

export interface WsTurnMessage {
	type: "session:turn";
	sessionId: string;
	payload: TurnEvent;
}

export interface WsHistoryMessage {
	type: "session:history";
	sessionId: string;
	entries: UpsertObject[];
}

export type StreamingServerMessage =
	| WsUpsertMessage
	| WsTurnMessage
	| WsHistoryMessage;
