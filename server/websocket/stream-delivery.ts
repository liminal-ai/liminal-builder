import type {
	StreamDelivery,
	WsHistoryMessage,
	WsTurnMessage,
	WsUpsertMessage,
} from "../../shared/stream-contracts";

export type StreamDeliveryEnvelope =
	| WsUpsertMessage
	| WsTurnMessage
	| WsHistoryMessage;

export interface StreamDeliveryDeps {
	send: (connectionId: string, message: StreamDeliveryEnvelope) => void;
}

export function createStreamDelivery(deps: StreamDeliveryDeps): StreamDelivery {
	return {
		deliverUpsert(connectionId, sessionId, payload) {
			deps.send(connectionId, {
				type: "session:upsert",
				sessionId,
				payload,
			});
		},
		deliverTurn(connectionId, sessionId, payload) {
			deps.send(connectionId, {
				type: "session:turn",
				sessionId,
				payload,
			});
		},
		deliverHistory(connectionId, sessionId, entries) {
			deps.send(connectionId, {
				type: "session:history",
				sessionId,
				entries,
			});
		},
	};
}
