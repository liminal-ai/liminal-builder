import type { ClientMessage } from "../../../shared/types";
import {
	sendEnvelope,
	sendError,
	toErrorMessage,
	type WsRouteContext,
} from "../route-context";

export async function handleProjectRoute(
	ctx: WsRouteContext,
	message: Extract<
		ClientMessage,
		{ type: "project:add" | "project:remove" | "project:list" }
	>,
): Promise<void> {
	switch (message.type) {
		case "project:add": {
			try {
				const project = await ctx.deps.projectStore.addProject(message.path);
				sendEnvelope(ctx.socket, {
					type: "project:added",
					project,
					requestId: message.requestId,
				});
			} catch (error) {
				sendError(ctx, message.requestId, toErrorMessage(error));
			}
			return;
		}

		case "project:remove": {
			try {
				await ctx.deps.projectStore.removeProject(message.projectId);
				sendEnvelope(ctx.socket, {
					type: "project:removed",
					projectId: message.projectId,
					requestId: message.requestId,
				});
			} catch (error) {
				sendError(ctx, message.requestId, toErrorMessage(error));
			}
			return;
		}

		case "project:list": {
			try {
				const projects = await ctx.deps.projectStore.listProjects();
				sendEnvelope(ctx.socket, {
					type: "project:list",
					projects,
				});
			} catch (error) {
				sendError(ctx, message.requestId, toErrorMessage(error));
			}
		}
	}
}
