import type { UpsertObject, TurnEvent } from "@server/streaming/upsert-types";

// Types re-exported for client consumption
export type {
	StreamEventEnvelope,
	StreamEventPayload,
	StreamEventType,
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

// Zod schemas re-exported for runtime validation (e.g., client-side WS message validation)
export {
	streamEventEnvelopeSchema,
	streamEventPayloadSchema,
	finalizedItemSchema,
	usageSchema,
} from "@server/streaming/stream-event-schema";

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
