import { randomUUID } from "node:crypto";
import type { EventEmitter } from "node:events";
import type { ConnectionContext } from "../shared/stream-contracts";
import type { ChatEntry, ClientMessage, ServerMessage } from "../shared/types";
import type { AcpPromptResult, AcpUpdateEvent } from "./acp/acp-types";
import type { AcpClient } from "./acp/acp-client";
import type { AgentStatus } from "./acp/agent-manager";
import type { ProjectStore } from "./projects/project-store";
import type { CliType, SessionPromptResult } from "./sessions/session-types";
import type { SessionManager } from "./sessions/session-manager";
import { createCompatibilityGateway } from "./websocket/compatibility-gateway";
import { createStreamDelivery } from "./websocket/stream-delivery";

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
		reconnect?: (cliType: CliType) => Promise<void>;
	};
	sessionManager?: Pick<
		SessionManager,
		| "listSessions"
		| "createSession"
		| "openSession"
		| "archiveSession"
		| "sendMessage"
	>;
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

type InFlightPromptState = {
	assistantEntryId: string | null;
	cancelRequested: boolean;
	completionTimer: ReturnType<typeof setTimeout> | null;
};

type ConnectionState = {
	context: ConnectionContext;
};

const SESSION_COMPLETE_GRACE_MS = 75;
const AGENT_ONLY_DISABLED_MESSAGES = new Set<ClientMessage["type"]>([
	"session:list",
	"session:archive",
]);
let agentOnlyModeWarningLogged = false;

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

function getDerivedTitle(
	result: SessionPromptResult | AcpPromptResult,
): string | undefined {
	if ("titleUpdated" in result) {
		return result.titleUpdated;
	}
	return undefined;
}

function mapToolStatus(
	status: string | undefined,
): "running" | "complete" | "error" {
	switch (status) {
		case "completed":
		case "complete":
			return "complete";
		case "failed":
		case "error":
			return "error";
		case "pending":
		case "in_progress":
		case "running":
		case undefined:
			return "running";
		default:
			return "running";
	}
}

function extractFirstText(content: unknown): string {
	if (Array.isArray(content)) {
		const first = content.find(
			(candidate): candidate is { type: "text"; text: string } =>
				typeof candidate === "object" &&
				candidate !== null &&
				(candidate as { type?: unknown }).type === "text" &&
				typeof (candidate as { text?: unknown }).text === "string",
		);
		return first?.text ?? "";
	}

	if (
		typeof content === "object" &&
		content !== null &&
		(content as { type?: unknown }).type === "text" &&
		typeof (content as { text?: unknown }).text === "string"
	) {
		return (content as { text: string }).text;
	}

	return "";
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
			const legacyToolCallId = (event as { tool_call_id?: unknown })
				.tool_call_id;
			const toolCallId =
				typeof event.toolCallId === "string"
					? event.toolCallId
					: typeof legacyToolCallId === "string"
						? legacyToolCallId
						: randomUUID();
			const title =
				typeof event.title === "string" && event.title.length > 0
					? event.title
					: "Tool call";
			const existingEntryId = bridgeState.toolEntryIds.get(toolCallId);
			const entryId = existingEntryId ?? randomUUID();
			bridgeState.toolEntryIds.set(toolCallId, entryId);
			bridgeState.toolTitles.set(toolCallId, title);

			const status = mapToolStatus(
				typeof event.status === "string" ? event.status : undefined,
			);
			const content = extractFirstText(event.content);
			const entry: ChatEntry = {
				entryId,
				type: "tool-call",
				toolCallId,
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

		case "tool_call_update": {
			const legacyToolCallId = (event as { tool_call_id?: unknown })
				.tool_call_id;
			const toolCallId =
				typeof event.toolCallId === "string"
					? event.toolCallId
					: typeof legacyToolCallId === "string"
						? legacyToolCallId
						: randomUUID();
			const existingEntryId = bridgeState.toolEntryIds.get(toolCallId);
			const entryId = existingEntryId ?? randomUUID();
			bridgeState.toolEntryIds.set(toolCallId, entryId);
			const title = bridgeState.toolTitles.get(toolCallId) ?? "Tool call";

			const status = mapToolStatus(
				typeof event.status === "string" ? event.status : undefined,
			);
			const content = extractFirstText(event.content);
			const entry: ChatEntry = {
				entryId,
				type: "tool-call",
				toolCallId,
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
		case "available_commands_update":
			return [];
		default:
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
		case "session:hello": {
			const capabilities = candidate.capabilities;
			const hasValidCapabilities =
				capabilities === undefined ||
				(typeof capabilities === "object" &&
					capabilities !== null &&
					("streamProtocol" in capabilities
						? (capabilities as { streamProtocol?: unknown }).streamProtocol ===
								"upsert-v1" ||
							(capabilities as { streamProtocol?: unknown }).streamProtocol ===
								undefined
						: true));
			return (
				hasValidCapabilities &&
				(candidate.streamProtocol === undefined ||
					candidate.streamProtocol === "upsert-v1")
			);
		}
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
	const connectionId = randomUUID();
	const sessionCwdByCanonicalId = new Map<string, string>();
	const inFlightPrompts = new Map<string, InFlightPromptState>();
	const streamDelivery = createStreamDelivery({
		send(targetConnectionId, message) {
			if (targetConnectionId !== connectionId) {
				return;
			}
			sendEnvelope(socket, message as ServerMessage);
		},
	});
	const compatibilityGateway = createCompatibilityGateway({
		streamDelivery,
		sendLegacy(targetConnectionId, payload) {
			if (targetConnectionId !== connectionId) {
				return;
			}
			sendEnvelope(socket, payload as ServerMessage);
		},
	});
	const connectionState: ConnectionState = {
		context: compatibilityGateway.negotiate(connectionId),
	};
	const disabledMessageTypes = deps.sessionManager
		? new Set<ClientMessage["type"]>()
		: AGENT_ONLY_DISABLED_MESSAGES;
	if (!deps.sessionManager && !agentOnlyModeWarningLogged) {
		agentOnlyModeWarningLogged = true;
		console.warn(
			"[ws] session manager unavailable: session:list and session:archive are disabled for this connection",
		);
	}

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
		void handleIncomingMessage(
			socket,
			raw,
			deps,
			sessionCwdByCanonicalId,
			inFlightPrompts,
			disabledMessageTypes,
			connectionId,
			connectionState,
			compatibilityGateway,
		);
	});

	socket.on("close", () => {
		for (const state of inFlightPrompts.values()) {
			if (state.completionTimer) {
				clearTimeout(state.completionTimer);
				state.completionTimer = null;
			}
		}
		inFlightPrompts.clear();
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
	inFlightPrompts: Map<string, InFlightPromptState>,
	disabledMessageTypes: Set<ClientMessage["type"]>,
	connectionId: string,
	connectionState: ConnectionState,
	compatibilityGateway: ReturnType<typeof createCompatibilityGateway>,
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
		if (disabledMessageTypes.has(message.type)) {
			sendEnvelope(socket, {
				type: "error",
				requestId: message.requestId,
				message: `${message.type} is unavailable in agent-only mode`,
			});
			return;
		}
		await routeMessage(
			socket,
			message,
			deps,
			sessionCwdByCanonicalId,
			inFlightPrompts,
			connectionId,
			connectionState,
			compatibilityGateway,
		);
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
	inFlightPrompts: Map<string, InFlightPromptState>,
	connectionId: string,
	connectionState: ConnectionState,
	compatibilityGateway: ReturnType<typeof createCompatibilityGateway>,
): Promise<void> {
	switch (message.type) {
		case "session:hello": {
			const negotiated = compatibilityGateway.negotiate(connectionId, {
				streamProtocol:
					message.capabilities?.streamProtocol ?? message.streamProtocol,
			});
			connectionState.context = negotiated;
			sendEnvelope(socket, {
				type: "session:hello:ack",
				selectedFamily: negotiated.selectedFamily,
			});
			break;
		}

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
				let canonicalSessionId: string;
				if (deps.sessionManager) {
					canonicalSessionId = await deps.sessionManager.createSession(
						message.projectId,
						message.cliType,
					);
				} else {
					const projectPath = await getProjectPath(
						deps.projectStore,
						message.projectId,
					);
					const client = await deps.agentManager.ensureAgent(message.cliType);
					const result = await client.sessionNew({ cwd: projectPath });
					canonicalSessionId = toCanonicalSessionId(
						message.cliType,
						result.sessionId,
					);
					sessionCwdByCanonicalId.set(canonicalSessionId, projectPath);
				}

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
				const entries = deps.sessionManager
					? await deps.sessionManager.openSession(message.sessionId)
					: await (async () => {
							const routing = parseSessionRouting(message.sessionId);
							const canonicalSessionId = toCanonicalSessionId(
								routing.cliType,
								message.sessionId,
							);
							const sessionCwd =
								sessionCwdByCanonicalId.get(canonicalSessionId) ?? ".";
							const client = await deps.agentManager.ensureAgent(
								routing.cliType,
							);
							return client.sessionLoad(routing.acpSessionId, sessionCwd);
						})();

				sendEnvelope(socket, {
					type: "session:history",
					sessionId: message.sessionId,
					entries,
					requestId: message.requestId,
				});
			} catch (error) {
				const messageText = toErrorMessage(error);
				sendEnvelope(socket, {
					type: "session:error",
					sessionId: message.sessionId,
					message: messageText,
				});
				sendEnvelope(socket, {
					type: "error",
					requestId: message.requestId,
					message: messageText,
				});
			}
			break;
		}

		case "session:send": {
			try {
				const bridgeState: PromptBridgeState = {
					assistantEntryId: null,
					toolEntryIds: new Map<string, string>(),
					toolTitles: new Map<string, string>(),
				};
				const inFlightState: InFlightPromptState = {
					assistantEntryId: null,
					cancelRequested: false,
					completionTimer: null,
				};
				inFlightPrompts.set(message.sessionId, inFlightState);

				const promptResult = deps.sessionManager
					? await deps.sessionManager.sendMessage(
							message.sessionId,
							message.content,
							(event) => {
								const outboundMessages = createPromptBridgeMessages(
									message.sessionId,
									event,
									bridgeState,
								);
								if (bridgeState.assistantEntryId) {
									inFlightState.assistantEntryId = bridgeState.assistantEntryId;
								}
								for (const outbound of outboundMessages) {
									compatibilityGateway.deliver(connectionState.context, {
										legacy: outbound,
									});
								}
							},
						)
					: await (async () => {
							const routing = parseSessionRouting(message.sessionId);
							const client = await deps.agentManager.ensureAgent(
								routing.cliType,
							);
							return client.sessionPrompt(
								routing.acpSessionId,
								message.content,
								(event) => {
									const outboundMessages = createPromptBridgeMessages(
										message.sessionId,
										event,
										bridgeState,
									);
									if (bridgeState.assistantEntryId) {
										inFlightState.assistantEntryId =
											bridgeState.assistantEntryId;
									}
									for (const outbound of outboundMessages) {
										compatibilityGateway.deliver(connectionState.context, {
											legacy: outbound,
										});
									}
								},
							);
						})();

				const derivedTitle = getDerivedTitle(promptResult);
				if (derivedTitle) {
					sendEnvelope(socket, {
						type: "session:title-updated",
						sessionId: message.sessionId,
						title: derivedTitle,
					});
				}

				inFlightState.assistantEntryId = bridgeState.assistantEntryId;
				if (bridgeState.assistantEntryId !== null) {
					const sendCancelled = () => {
						compatibilityGateway.deliver(connectionState.context, {
							legacy: {
								type: "session:cancelled",
								sessionId: message.sessionId,
								entryId: bridgeState.assistantEntryId as string,
							},
						});
					};

					const sendComplete = () => {
						compatibilityGateway.deliver(connectionState.context, {
							legacy: {
								type: "session:complete",
								sessionId: message.sessionId,
								entryId: bridgeState.assistantEntryId as string,
							},
						});
					};

					if (
						promptResult.stopReason === "cancelled" ||
						inFlightState.cancelRequested
					) {
						sendCancelled();
						inFlightPrompts.delete(message.sessionId);
					} else if (deps.sessionManager) {
						// session:cancel can race with prompt completion in local integration.
						inFlightState.completionTimer = setTimeout(() => {
							const latestState = inFlightPrompts.get(message.sessionId);
							inFlightPrompts.delete(message.sessionId);
							if (!latestState) {
								return;
							}
							if (latestState.cancelRequested) {
								sendCancelled();
								return;
							}
							sendComplete();
						}, SESSION_COMPLETE_GRACE_MS);
					} else {
						sendComplete();
						inFlightPrompts.delete(message.sessionId);
					}
				} else {
					inFlightPrompts.delete(message.sessionId);
				}
			} catch (error) {
				const messageText = toErrorMessage(error);
				const inFlightState = inFlightPrompts.get(message.sessionId);
				if (inFlightState?.completionTimer) {
					clearTimeout(inFlightState.completionTimer);
				}
				inFlightPrompts.delete(message.sessionId);
				sendEnvelope(socket, {
					type: "session:error",
					sessionId: message.sessionId,
					message: messageText,
				});
				sendEnvelope(socket, {
					type: "error",
					requestId: message.requestId,
					message: messageText,
				});
			}
			break;
		}

		case "session:cancel": {
			try {
				const routing = parseSessionRouting(message.sessionId);
				const client = await deps.agentManager.ensureAgent(routing.cliType);
				client.sessionCancel(routing.acpSessionId);

				const inFlightState = inFlightPrompts.get(message.sessionId);
				if (inFlightState) {
					inFlightState.cancelRequested = true;
					const hadCompletionTimer = inFlightState.completionTimer !== null;

					if (inFlightState.completionTimer) {
						clearTimeout(inFlightState.completionTimer);
						inFlightState.completionTimer = null;
					}

					if (hadCompletionTimer && inFlightState.assistantEntryId) {
						compatibilityGateway.deliver(connectionState.context, {
							legacy: {
								type: "session:cancelled",
								sessionId: message.sessionId,
								entryId: inFlightState.assistantEntryId,
							},
						});
						inFlightPrompts.delete(message.sessionId);
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

		case "session:archive": {
			try {
				deps.sessionManager?.archiveSession(message.sessionId);
				sendEnvelope(socket, {
					type: "session:archived",
					sessionId: message.sessionId,
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

		case "session:list": {
			try {
				const sessions =
					deps.sessionManager?.listSessions(message.projectId) ?? [];
				sendEnvelope(socket, {
					type: "session:list",
					projectId: message.projectId,
					sessions,
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

		case "session:reconnect": {
			try {
				if (!deps.agentManager.reconnect) {
					sendEnvelope(socket, {
						type: "error",
						requestId: message.requestId,
						message: "session:reconnect is unavailable",
					});
					break;
				}
				sendEnvelope(socket, {
					type: "agent:status",
					cliType: message.cliType,
					status: "reconnecting",
				});
				await deps.agentManager.reconnect(message.cliType);
			} catch (error) {
				sendEnvelope(socket, {
					type: "error",
					requestId: message.requestId,
					message: toErrorMessage(error),
				});
			}
			break;
		}
	}
}
