import rule from "../src/rules/no-raw-websocket-send";
import { createRuleTester } from "./rule-tester";

const ruleTester = createRuleTester();

ruleTester.run("no-raw-websocket-send", rule, {
	valid: [
		{
			code: `
				interface Reply { send(payload: string): void; }
				declare const reply: Reply;
				reply.send("ok");
			`,
			filename: "input.ts",
		},
		{
			code: `
				declare function sendEnvelope(socket: WebSocket, payload: string): void;
				declare const socket: WebSocket;
				sendEnvelope(socket, "ok");
			`,
			filename: "input.ts",
		},
		{
			code: `
				declare const ws: { publish(payload: string): void };
				ws.publish("ok");
			`,
			filename: "input.ts",
		},
		{
			code: `
				function sendEnvelope(socket: WebSocket, payload: string): void {
					socket.send(payload);
				}
			`,
			filename: "input.ts",
		},
	],
	invalid: [
		{
			code: `
				declare const socket: WebSocket;
				socket.send("ok");
			`,
			filename: "input.ts",
			errors: [
				{
					messageId: "rawWebSocketSend",
					suggestions: [
						{
							messageId: "useSendEnvelopeSuggestion",
							output: `
				declare const socket: WebSocket;
				sendEnvelope(socket, "ok");
			`,
						},
					],
				},
			],
		},
		{
			code: `
				type SocketAlias = WebSocket;
				declare const ws: SocketAlias;
				ws.send("ok");
			`,
			filename: "input.ts",
			errors: [
				{
					messageId: "rawWebSocketSend",
					suggestions: [
						{
							messageId: "useSendEnvelopeSuggestion",
							output: `
				type SocketAlias = WebSocket;
				declare const ws: SocketAlias;
				sendEnvelope(ws, "ok");
			`,
						},
					],
				},
			],
		},
		{
			code: `
				function push(socket: WebSocket): void {
					socket.send("ok");
				}
			`,
			filename: "input.ts",
			errors: [
				{
					messageId: "rawWebSocketSend",
					suggestions: [
						{
							messageId: "useSendEnvelopeSuggestion",
							output: `
				function push(socket: WebSocket): void {
					sendEnvelope(socket, "ok");
				}
			`,
						},
					],
				},
			],
		},
	],
});
