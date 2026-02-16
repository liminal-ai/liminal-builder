import type { FastifyInstance } from "fastify";
import { NotImplementedError } from "../../errors";
import type { SessionService } from "./session-service";

export interface SessionRoutesDeps {
	sessionService: SessionService;
}

export async function registerSessionRoutes(
	app: FastifyInstance,
	deps: SessionRoutesDeps,
): Promise<void> {
	void deps;

	const notImplemented = (routeName: string): never => {
		throw new NotImplementedError(`registerSessionRoutes.${routeName}`);
	};

	app.post("/api/session/create", async () => notImplemented("create"));
	app.post("/api/session/:id/load", async () => notImplemented("load"));
	app.get("/api/session/list", async () => notImplemented("list"));
	app.get("/api/session/:id/status", async () => notImplemented("status"));
	app.post("/api/session/:id/send", async () => notImplemented("send"));
	app.post("/api/session/:id/cancel", async () => notImplemented("cancel"));
	app.post("/api/session/:id/kill", async () => notImplemented("kill"));
}
