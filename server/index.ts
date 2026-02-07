import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { join } from "node:path";
import { handleWebSocket } from "./websocket";

const PORT = Number(process.env.PORT) || 3000;
const CLIENT_DIR = join(import.meta.dir, "..", "client");

async function main() {
	const app = Fastify({ logger: true });

	// Static file serving for the client
	await app.register(fastifyStatic, {
		root: CLIENT_DIR,
		prefix: "/",
	});

	// WebSocket support
	await app.register(fastifyWebsocket);

	// WebSocket endpoint
	app.get("/ws", { websocket: true }, (socket, _req) => {
		handleWebSocket(socket);
	});

	// Start server
	await app.listen({ port: PORT, host: "0.0.0.0" });
	console.log(`Liminal Builder running at http://localhost:${PORT}`);
}

main().catch((err) => {
	console.error("Failed to start server:", err);
	process.exit(1);
});
