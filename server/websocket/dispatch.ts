import type { ClientMessage } from "../../shared/types";
import { handleProjectRoute } from "./routes/project-routes";
import { handleSessionRoute } from "./routes/session-routes";
import { handleAgentReconnectRoute } from "./routes/agent-routes";
import type { WsRouteContext } from "./route-context";

type RouteHandler<TMessage extends ClientMessage = ClientMessage> = (
	ctx: WsRouteContext,
	message: TMessage,
) => Promise<void>;

const routeHandlers: {
	[K in ClientMessage["type"]]: RouteHandler<
		Extract<ClientMessage, { type: K }>
	>;
} = {
	"project:add": handleProjectRoute,
	"project:remove": handleProjectRoute,
	"project:list": handleProjectRoute,
	"session:create": handleSessionRoute,
	"session:open": handleSessionRoute,
	"session:send": handleSessionRoute,
	"session:cancel": handleSessionRoute,
	"session:archive": handleSessionRoute,
	"session:list": handleSessionRoute,
	"session:reconnect": handleAgentReconnectRoute,
};

export async function dispatchMessage(
	ctx: WsRouteContext,
	message: ClientMessage,
): Promise<void> {
	const handler = routeHandlers[message.type];
	await handler(ctx, message as never);
}
