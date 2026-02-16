import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { join } from "node:path";
import { AgentManager } from "./acp/agent-manager";
import { registerSessionRoutes } from "./api/session/routes";
import { createSessionService } from "./api/session/session-service";
import type { Project } from "./projects/project-types";
import { ProjectStore } from "./projects/project-store";
import { SessionManager } from "./sessions/session-manager";
import type { SessionMeta } from "./sessions/session-types";
import { JsonStore } from "./store/json-store";
import { handleWebSocket } from "./websocket";

const PORT = Number(process.env.PORT) || 3000;
const CLIENT_DIR = join(import.meta.dir, "..", "client");
const NODE_MODULES_DIR = join(import.meta.dir, "..", "node_modules");
const PROJECTS_FILE = join(homedir(), ".liminal-builder", "projects.json");
const SESSIONS_FILE = join(homedir(), ".liminal-builder", "sessions.json");

async function main() {
	const app = Fastify({ logger: true });

	const projectsStore = new JsonStore<Project[]>(
		{ filePath: PROJECTS_FILE, writeDebounceMs: 500 },
		[],
	);
	const projectStore = new ProjectStore(projectsStore);
	const sessionsStore = new JsonStore<SessionMeta[]>(
		{ filePath: SESSIONS_FILE, writeDebounceMs: 500 },
		[],
	);
	const agentManager = new AgentManager(new EventEmitter());
	const sessionManager = new SessionManager(
		sessionsStore,
		agentManager,
		projectStore,
	);
	const sessionService = createSessionService();

	await app.register(fastifyStatic, {
		root: NODE_MODULES_DIR,
		prefix: "/vendor/",
	});
	// Static file serving for the client
	await app.register(fastifyStatic, {
		root: CLIENT_DIR,
		prefix: "/",
		decorateReply: false,
	});

	// WebSocket support
	await app.register(fastifyWebsocket);

	// WebSocket endpoint
	app.get("/ws", { websocket: true }, (socket, _req) => {
		handleWebSocket(socket, { projectStore, agentManager, sessionManager });
	});

	await registerSessionRoutes(app, { sessionService });

	// Default route: land on the shell home page.
	app.get("/", async (_req, reply) => {
		return reply.redirect("/shell/index.html");
	});

	// Start server
	await app.listen({ port: PORT, host: "0.0.0.0" });
	console.log(`Liminal Builder running at http://localhost:${PORT}`);

	let shuttingDown = false;
	const shutdown = async (signal: string) => {
		if (shuttingDown) {
			return;
		}
		shuttingDown = true;
		console.log(`\n[server] Received ${signal}, shutting down...`);
		try {
			await agentManager.shutdownAll();
			await app.close();
			process.exit(0);
		} catch (error) {
			console.error("[server] Shutdown failed:", error);
			process.exit(1);
		}
	};

	process.on("SIGINT", () => {
		void shutdown("SIGINT");
	});
	process.on("SIGTERM", () => {
		void shutdown("SIGTERM");
	});
}

main().catch((err) => {
	console.error("Failed to start server:", err);
	process.exit(1);
});
