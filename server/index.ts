import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { join } from "node:path";
import { AgentManager } from "./acp/agent-manager";
import type { Project } from "./projects/project-types";
import { ProjectStore } from "./projects/project-store";
import { JsonStore } from "./store/json-store";
import { handleWebSocket } from "./websocket";

const PORT = Number(process.env.PORT) || 3000;
const CLIENT_DIR = join(import.meta.dir, "..", "client");
const PROJECTS_FILE = join(homedir(), ".liminal-builder", "projects.json");

async function main() {
	const app = Fastify({ logger: true });

	const projectsStore = new JsonStore<Project[]>(
		{ filePath: PROJECTS_FILE, writeDebounceMs: 500 },
		[],
	);
	const projectStore = new ProjectStore(projectsStore);
	const agentManager = new AgentManager(new EventEmitter());

	// Static file serving for the client
	await app.register(fastifyStatic, {
		root: CLIENT_DIR,
		prefix: "/",
	});

	// WebSocket support
	await app.register(fastifyWebsocket);

	// WebSocket endpoint
	app.get("/ws", { websocket: true }, (socket, _req) => {
		handleWebSocket(socket, { projectStore, agentManager });
	});

	// Start server
	await app.listen({ port: PORT, host: "0.0.0.0" });
	console.log(`Liminal Builder running at http://localhost:${PORT}`);
}

main().catch((err) => {
	console.error("Failed to start server:", err);
	process.exit(1);
});
