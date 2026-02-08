import { randomUUID } from "node:crypto";
import type { EventEmitter } from "node:events";
import type { ChatEntry, ClientMessage, ServerMessage } from "../shared/types";
import type { AcpUpdateEvent } from "./acp/acp-types";
import type { AcpClient } from "./acp/acp-client";
import type { AgentStatus } from "./acp/agent-manager";
import type { ProjectStore } from "./projects/project-store";
import type { CliType } from "./sessions/session-types";

type WebSocketLike = {
	send: (payload: string) => void;
	on: {
		(event: "message", listener: (raw: Buffer | string) => void): void;
		(event: "close", listener: () => void): void;
		(event: "error", listener: (error: Error) => void): void;
	};
};

type ProjectStoreLike = Pick<
	ProjectStore,
	"addProject" | "removeProject" | "listProjects"
>;

export interface WebSocketDeps {
	projectStore: ProjectStoreLike;
	agentManager: {
		emitter: Pick<EventEmitter, "on" | "off">;
		ensureAgent: (cliType: CliType) => Promise<AcpClient>;
	};
}

type SessionRouting = {
	cliType: CliType;
	acpSessionId: string;
};

type PromptBridgeState = {
	assistantEntryId: string | null;
	toolEntryIds: Map<string, string>;
	toolTitles: Map<string, string>;
};

function sendEnvelope(socket: WebSocketLike, message: ServerMessage): void {
	socket.send(JSON.stringify(message));
}

function isCliType(value: string): value is CliType {
	return value === "claude-code" || value === "codex";
}

function parseSessionRouting(sessionId: string): SessionRouting {
	const colonIndex = sessionId.indexOf(":");
	if (colonIndex > 0) {
		const maybeCliType = sessionId.substring(0, colonIndex);
		if (isCliType(maybeCliType)) {
			return {
				cliType: maybeCliType,
				acpSessionId: sessionId.substring(colonIndex + 1),
			};
		}
	}

	return {
		cliType: "claude-code",
		acpSessionId: sessionId,
	};
}

function toCanonicalSessionId(cliType: CliType, sessionId: string): string {
	const parsed = parseSessionRouting(sessionId);
	if (parsed.cliType === cliType && sessionId.includes(":")) {
		return sessionId;
	}
	return `${cliType}:${parsed.acpSessionId}`;
}

function mapToolStatus(
	status: "pending" | "in_progress" | "completed" | "failed" | undefined,
): "running" | "complete" | "error" {
	switch (status) {
		case "completed":
			return "complete";
		case "failed":
			return "error";
		case "pending":
		case "in_progress":
		case undefined:
			return "running";
	}
}

function extractFirstText(
	content: Array<{ type: "text"; text: string }> | undefined,
): string {
	return content?.[0]?.text ?? "";
}

function createTextEntry(
	entryType: "user" | "assistant",
	content: string,
): ChatEntry {
	return {
		entryId: randomUUID(),
		type: entryType,
		content,
		timestamp: new Date().toISOString(),
	};
}

function createPromptBridgeMessages(
	sessionId: string,
	event: AcpUpdateEvent,
	bridgeState: PromptBridgeState,
): ServerMessage[] {
	switch (event.type) {
		case "agent_message_chunk": {
			const chunk = extractFirstText(event.content);
			const messages: ServerMessage[] = [];

			if (bridgeState.assistantEntryId === null) {
				const assistantEntry = createTextEntry("assistant", "");
				bridgeState.assistantEntryId = assistantEntry.entryId;
				messages.push({
					type: "session:update",
					sessionId,
					entry: assistantEntry,
				});
			}

			if (chunk.length > 0) {
				messages.push({
					type: "session:chunk",
					sessionId,
					entryId: bridgeState.assistantEntryId,
					content: chunk,
				});
			}

			return messages;
		}

		case "user_message_chunk": {
			const content = extractFirstText(event.content);
			if (content.length === 0) {
				return [];
			}
			return [
				{
					type: "session:update",
					sessionId,
					entry: createTextEntry("user", content),
				},
			];
		}

		case "agent_thought_chunk": {
			const content = extractFirstText(event.content);
			if (content.length === 0) {
				return [];
			}
			return [
				{
					type: "session:update",
					sessionId,
					entry: {
						entryId: randomUUID(),
						type: "thinking",
						content,
					},
				},
			];
		}

		case "tool_call": {
			const existingEntryId = bridgeState.toolEntryIds.get(event.toolCallId);
			const entryId = existingEntryId ?? randomUUID();
			bridgeState.toolEntryIds.set(event.toolCallId, entryId);
			bridgeState.toolTitles.set(event.toolCallId, event.title);

			const status = mapToolStatus(event.status);
			const content = extractFirstText(event.content);
			const entry: ChatEntry = {
				entryId,
				type: "tool-call",
				toolCallId: event.toolCallId,
				name: event.title,
				status,
			};
			if (status === "complete" && content.length > 0) {
				entry.result = content;
			}
			if (status === "error" && content.length > 0) {
				entry.error = content;
			}

			return [{ type: "session:update", sessionId, entry }];
		}

		case "tool_call_update": {
			const existingEntryId = bridgeState.toolEntryIds.get(event.toolCallId);
			const entryId = existingEntryId ?? randomUUID();
			bridgeState.toolEntryIds.set(event.toolCallId, entryId);
			const title = bridgeState.toolTitles.get(event.toolCallId) ?? "Tool call";

			const status = mapToolStatus(event.status);
			const content = extractFirstText(event.content);
			const entry: ChatEntry = {
				entryId,
				type: "tool-call",
				toolCallId: event.toolCallId,
				name: title,
				status,
			};
			if (status === "complete" && content.length > 0) {
				entry.result = content;
			}
			if (status === "error" && content.length > 0) {
				entry.error = content;
			}

			return [{ type: "session:update", sessionId, entry }];
		}

		case "plan":
		case "config_options_update":
		case "current_mode_update":
			return [];
	}
}

function isClientMessage(value: unknown): value is ClientMessage {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	if (typeof candidate.type !== "string") {
		return false;
	}

	switch (candidate.type) {
		case "project:add":
			return typeof candidate.path === "string";
		case "project:remove":
			return typeof candidate.projectId === "string";
		case "project:list":
			return true;
		case "session:open":
		case "session:cancel":
		case "session:archive":
			return typeof candidate.sessionId === "string";
		case "session:create":
			return (
				typeof candidate.projectId === "string" &&
				(candidate.cliType === "claude-code" || candidate.cliType === "codex")
			);
		case "session:send":
			return (
				typeof candidate.sessionId === "string" &&
				typeof candidate.content === "string"
			);
		case "session:reconnect":
			return (
				candidate.cliType === "claude-code" || candidate.cliType === "codex"
			);
		case "session:list":
			return typeof candidate.projectId === "string";
		default:
			return false;
	}
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return "Internal error";
}

function extractRequestId(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}

	const requestId = (value as Record<string, unknown>).requestId;
	return typeof requestId === "string" ? requestId : undefined;
}

async function getProjectPath(
	projectStore: ProjectStoreLike,
	projectId: string,
): Promise<string> {
	const projects = await projectStore.listProjects();
	const project = projects.find((candidate) => candidate.id === projectId);
	if (!project) {
		throw new Error("Project not found");
	}
	return project.path;
}

/**
 * WebSocket connection handler.
 * Routes client messages to project-store, session-manager, agent-manager.
 * Sends server messages back to the connected client.
 */
export function handleWebSocket(
	socket: WebSocketLike,
	deps: WebSocketDeps,
): void {
	console.log("[ws] Client connected");
	const sessionCwdByCanonicalId = new Map<string, string>();

	const onAgentStatus = (payload: {
		cliType: CliType;
		status: AgentStatus;
	}) => {
		if (payload.status === "idle") {
			return;
		}
		sendEnvelope(socket, {
			type: "agent:status",
			cliType: payload.cliType,
			status: payload.status,
		});
	};

	const onAgentError = (payload: { cliType: CliType; message: string }) => {
		sendEnvelope(socket, {
			type: "error",
			message: payload.message,
		});
	};

	deps.agentManager.emitter.on("agent:status", onAgentStatus);
	deps.agentManager.emitter.on("error", onAgentError);

	socket.on("message", (raw: Buffer | string) => {
		void handleIncomingMessage(socket, raw, deps, sessionCwdByCanonicalId);
	});

	socket.on("close", () => {
		deps.agentManager.emitter.off("agent:status", onAgentStatus);
		deps.agentManager.emitter.off("error", onAgentError);
		console.log("[ws] Client disconnected");
	});

	socket.on("error", (err: Error) => {
		console.error("[ws] Socket error:", err.message);
	});
}

async function handleIncomingMessage(
	socket: WebSocketLike,
	raw: Buffer | string,
	deps: WebSocketDeps,
	sessionCwdByCanonicalId: Map<string, string>,
): Promise<void> {
	try {
		const parsed = JSON.parse(
			typeof raw === "string" ? raw : raw.toString("utf-8"),
		) as unknown;
		const requestId = extractRequestId(parsed);

		if (!isClientMessage(parsed)) {
			sendEnvelope(socket, {
				type: "error",
				requestId,
				message: "Invalid message format",
			});
			return;
		}

		const message = parsed;
		console.log("[ws] Received:", message.type);
		await routeMessage(socket, message, deps, sessionCwdByCanonicalId);
	} catch (error) {
		console.error("[ws] Failed to handle message:", error);
		sendEnvelope(socket, {
			type: "error",
			message: toErrorMessage(error),
		});
	}
}

async function routeMessage(
	socket: WebSocketLike,
	message: ClientMessage,
	deps: WebSocketDeps,
	sessionCwdByCanonicalId: Map<string, string>,
): Promise<void> {
	switch (message.type) {
		case "project:add": {
			try {
				const project = await deps.projectStore.addProject(message.path);
				sendEnvelope(socket, {
					type: "project:added",
					project,
					requestId: message.requestId,
				});
			} catch (error) {
				sendEnvelope(socket, {
					type: "error",
					requestId: message.requestId,
					message: toErrorMessage(error),
				});
			}
			break;
		}

		case "project:remove": {
			try {
				await deps.projectStore.removeProject(message.projectId);
				sendEnvelope(socket, {
					type: "project:removed",
					projectId: message.projectId,
					requestId: message.requestId,
				});
			} catch (error) {
				sendEnvelope(socket, {
					type: "error",
					requestId: message.requestId,
					message: toErrorMessage(error),
				});
			}
			break;
		}

		case "project:list": {
			try {
				const projects = await deps.projectStore.listProjects();
				sendEnvelope(socket, {
					type: "project:list",
					projects,
				});
			} catch (error) {
				sendEnvelope(socket, {
					type: "error",
					requestId: message.requestId,
					message: toErrorMessage(error),
				});
			}
			break;
		}

		case "session:create": {
			try {
				const projectPath = await getProjectPath(
					deps.projectStore,
					message.projectId,
				);
				const client = await deps.agentManager.ensureAgent(message.cliType);
				const result = await client.sessionNew({ cwd: projectPath });
				const canonicalSessionId = toCanonicalSessionId(
					message.cliType,
					result.sessionId,
				);
				sessionCwdByCanonicalId.set(canonicalSessionId, projectPath);
				sendEnvelope(socket, {
					type: "session:created",
					sessionId: canonicalSessionId,
					projectId: message.projectId,
					requestId: message.requestId,
				});
			} catch (error) {
				sendEnvelope(socket, {
					type: "error",
					requestId: message.requestId,
					message: toErrorMessage(error),
				});
			}
			break;
		}

		case "session:open": {
			try {
				const routing = parseSessionRouting(message.sessionId);
				const canonicalSessionId = toCanonicalSessionId(
					routing.cliType,
					message.sessionId,
				);
				const sessionCwd =
					sessionCwdByCanonicalId.get(canonicalSessionId) ?? ".";
				const client = await deps.agentManager.ensureAgent(routing.cliType);
				const entries = await client.sessionLoad(
					routing.acpSessionId,
					sessionCwd,
				);
				sendEnvelope(socket, {
					type: "session:history",
					sessionId: message.sessionId,
					entries,
					requestId: message.requestId,
				});
			} catch (error) {
				sendEnvelope(socket, {
					type: "error",
					requestId: message.requestId,
					message: toErrorMessage(error),
				});
			}
			break;
		}

		case "session:send": {
			try {
				const routing = parseSessionRouting(message.sessionId);
				const client = await deps.agentManager.ensureAgent(routing.cliType);
				const bridgeState: PromptBridgeState = {
					assistantEntryId: null,
					toolEntryIds: new Map<string, string>(),
					toolTitles: new Map<string, string>(),
				};

				const promptResult = await client.sessionPrompt(
					routing.acpSessionId,
					message.content,
					(event) => {
						const outboundMessages = createPromptBridgeMessages(
							message.sessionId,
							event,
							bridgeState,
						);
						for (const outbound of outboundMessages) {
							sendEnvelope(socket, outbound);
						}
					},
				);

				if (bridgeState.assistantEntryId !== null) {
					if (promptResult.stopReason === "cancelled") {
						sendEnvelope(socket, {
							type: "session:cancelled",
							sessionId: message.sessionId,
							entryId: bridgeState.assistantEntryId,
						});
					} else {
						sendEnvelope(socket, {
							type: "session:complete",
							sessionId: message.sessionId,
							entryId: bridgeState.assistantEntryId,
						});
					}
				}
			} catch (error) {
				sendEnvelope(socket, {
					type: "error",
					requestId: message.requestId,
					message: toErrorMessage(error),
				});
			}
			break;
		}

		case "session:cancel": {
			try {
				const routing = parseSessionRouting(message.sessionId);
				const client = await deps.agentManager.ensureAgent(routing.cliType);
				client.sessionCancel(routing.acpSessionId);
			} catch (error) {
				sendEnvelope(socket, {
					type: "error",
					requestId: message.requestId,
					message: toErrorMessage(error),
				});
			}
			break;
		}

		case "session:archive":
		case "session:reconnect":
		case "session:list": {
			sendEnvelope(socket, {
				type: "error",
				requestId: message.requestId,
				message: `Handler not implemented: ${message.type}`,
			});
			break;
		}
	}
}
