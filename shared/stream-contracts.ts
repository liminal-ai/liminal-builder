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

export type StreamProtocolFamily = "legacy" | "upsert-v1";

export interface ConnectionCapabilities {
	streamProtocol?: "upsert-v1";
}

export interface ConnectionContext {
	connectionId: string;
	selectedFamily: StreamProtocolFamily;
}

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

export interface StreamDelivery {
	deliverUpsert(
		connectionId: string,
		sessionId: string,
		payload: UpsertObject,
	): void;
	deliverTurn(
		connectionId: string,
		sessionId: string,
		payload: TurnEvent,
	): void;
	deliverHistory(
		connectionId: string,
		sessionId: string,
		entries: UpsertObject[],
	): void;
}

export interface CompatibilityGateway {
	negotiate(
		connectionId: string,
		capabilities?: ConnectionCapabilities,
	): ConnectionContext;
	deliver(
		context: ConnectionContext,
		payload: { upsert?: UpsertObject; turn?: TurnEvent; legacy?: unknown },
	): void;
}

export type StreamingServerMessage =
	| WsUpsertMessage
	| WsTurnMessage
	| WsHistoryMessage;
