import type {
	CompatibilityGateway,
	ConnectionCapabilities,
	ConnectionContext,
	StreamDelivery,
	StreamProtocolFamily,
} from "../../shared/stream-contracts";

export interface CompatibilityGatewayDeps {
	streamDelivery: StreamDelivery;
	sendLegacy: (connectionId: string, payload: unknown) => void;
}

function selectFamily(
	capabilities: ConnectionCapabilities | undefined,
): StreamProtocolFamily {
	if (capabilities?.streamProtocol === "upsert-v1") {
		return "upsert-v1";
	}
	return "legacy";
}

export function createCompatibilityGateway(
	deps: CompatibilityGatewayDeps,
): CompatibilityGateway {
	const contexts = new Map<string, ConnectionContext>();

	return {
		negotiate(connectionId, capabilities) {
			const existing = contexts.get(connectionId);
			if (existing) {
				return existing;
			}

			const context: ConnectionContext = {
				connectionId,
				selectedFamily: selectFamily(capabilities),
			};
			contexts.set(connectionId, context);
			return context;
		},
		deliver(context, payload) {
			const activeContext =
				contexts.get(context.connectionId) ??
				({
					connectionId: context.connectionId,
					selectedFamily: "legacy",
				} satisfies ConnectionContext);

			if (activeContext.selectedFamily === "upsert-v1") {
				if (payload.upsert) {
					deps.streamDelivery.deliverUpsert(
						activeContext.connectionId,
						payload.upsert.sessionId,
						payload.upsert,
					);
				}
				if (payload.turn) {
					deps.streamDelivery.deliverTurn(
						activeContext.connectionId,
						payload.turn.sessionId,
						payload.turn,
					);
				}
				return;
			}

			if (payload.legacy !== undefined) {
				deps.sendLegacy(activeContext.connectionId, payload.legacy);
			}
		},
	};
}
