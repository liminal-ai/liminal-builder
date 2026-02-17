import { randomUUID } from "node:crypto";
import type { EventEmitter } from "node:events";
import type { ChatEntry, ClientMessage, ServerMessage } from "../shared/types";
import type { StreamDelivery } from "../shared/stream-contracts";
import type { AcpPromptResult, AcpUpdateEvent } from "./acp/acp-types";
import type { AcpClient } from "./acp/acp-client";
import type { AgentStatus } from "./acp/agent-manager";
import type { ProjectStore } from "./projects/project-store";
import type { TurnEvent, UpsertObject } from "./streaming/upsert-types";
import type { CliType, SessionPromptResult } from "./sessions/session-types";
import type { SessionManager } from "./sessions/session-manager";
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

type PendingContentState = {
	itemId: string;
	content: string;
	sourceTimestamp: string;
};

type ToolCallBridgeState = {
	itemId: string;
	toolName: string;
	toolArguments: Record<string, unknown>;
};

type UpsertBridgeState = {
	turnId: string;
	sessionId: string;
	cliType: CliType;
	nextItemOrdinal: number;
	activeAssistantMessage: PendingContentState | null;
	activeThinkingMessage: PendingContentState | null;
	toolCallsById: Map<string, ToolCallBridgeState>;
};

type InFlightPromptState = {
	turnId: string;
	cancelRequested: boolean;
	completionTimer: ReturnType<typeof setTimeout> | null;
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

function resolveToolUpsertStatus(
	status: unknown,
	eventType: "tool_call" | "tool_call_update",
): UpsertObject["status"] {
	if (status === "completed" || status === "complete") {
		return "complete";
	}
	if (status === "failed" || status === "error") {
		return "error";
	}
	if (
		status === "pending" ||
		status === "in_progress" ||
		status === "running"
	) {
		return eventType === "tool_call" ? "create" : "update";
	}
	if (eventType === "tool_call") {
		return "create";
	}
	return "update";
}

function resolveTurnCompletionStatus(
	stopReason: AcpPromptResult["stopReason"],
	cancelRequested: boolean,
): "completed" | "cancelled" | null {
	if (cancelRequested || stopReason === "cancelled") {
		return "cancelled";
	}
	switch (stopReason) {
		case "end_turn":
		case "max_tokens":
		case "max_turn_requests":
		case "refusal":
			return "completed";
		default:
			return null;
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

function nowIso(): string {
	return new Date().toISOString();
}

function extractToolCallId(event: AcpUpdateEvent): string {
	const eventRecord = event as Record<string, unknown>;
	if (typeof eventRecord.toolCallId === "string") {
		return eventRecord.toolCallId;
	}
	if (typeof eventRecord.tool_call_id === "string") {
		return eventRecord.tool_call_id;
	}
	return randomUUID();
}

function extractToolArguments(event: AcpUpdateEvent): Record<string, unknown> {
	const eventRecord = event as Record<string, unknown>;
	const directArguments = eventRecord.toolArguments ?? eventRecord.arguments;
	if (
		typeof directArguments === "object" &&
		directArguments !== null &&
		!Array.isArray(directArguments)
	) {
		return directArguments as Record<string, unknown>;
	}
	return {};
}

function createUpsertBridgeState(
	sessionId: string,
	turnId: string,
): UpsertBridgeState {
	return {
		turnId,
		sessionId,
		cliType: parseSessionRouting(sessionId).cliType,
		nextItemOrdinal: 0,
		activeAssistantMessage: null,
		activeThinkingMessage: null,
		toolCallsById: new Map<string, ToolCallBridgeState>(),
	};
}

function nextItemId(state: UpsertBridgeState, suffix?: string): string {
	state.nextItemOrdinal += 1;
	if (suffix) {
		return `${state.turnId}:${state.nextItemOrdinal}:${suffix}`;
	}
	return `${state.turnId}:${state.nextItemOrdinal}`;
}

function toHistoryUpsert(
	entry: ChatEntry,
	sessionId: string,
	index: number,
): UpsertObject {
	const turnId = `history:${index + 1}`;
	const sourceTimestamp =
		"timestamp" in entry && typeof entry.timestamp === "string"
			? entry.timestamp
			: nowIso();
	const emittedAt = nowIso();
	const itemId =
		typeof entry.entryId === "string" && entry.entryId.length > 0
			? entry.entryId
			: `${turnId}:item:${index + 1}`;

	switch (entry.type) {
		case "user":
			return {
				type: "message",
				status: "complete",
				turnId,
				sessionId,
				itemId,
				sourceTimestamp,
				emittedAt,
				content: entry.content,
				origin: "user",
			};
		case "assistant":
			return {
				type: "message",
				status: "complete",
				turnId,
				sessionId,
				itemId,
				sourceTimestamp,
				emittedAt,
				content: entry.content,
				origin: "agent",
			};
		case "thinking":
			return {
				type: "thinking",
				status: "complete",
				turnId,
				sessionId,
				itemId,
				sourceTimestamp,
				emittedAt,
				content: entry.content,
				providerId: parseSessionRouting(sessionId).cliType,
			};
		case "tool-call": {
			const isError = entry.status === "error";
			const toolOutput = isError ? entry.error : entry.result;
			return {
				type: "tool_call",
				status: isError ? "error" : "complete",
				turnId,
				sessionId,
				itemId,
				sourceTimestamp,
				emittedAt,
				toolName: entry.name,
				toolArguments: {},
				callId: entry.toolCallId,
				...(typeof toolOutput === "string" ? { toolOutput } : {}),
				...(isError
					? {
							toolOutputIsError: true,
							errorCode: "PROCESS_CRASH",
							errorMessage: entry.error ?? "Tool call failed",
						}
					: {}),
			};
		}
	}
}

function isUpsertObject(value: unknown): value is UpsertObject {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.type === "string" &&
		typeof candidate.turnId === "string" &&
		typeof candidate.sessionId === "string" &&
		typeof candidate.itemId === "string" &&
		typeof candidate.sourceTimestamp === "string" &&
		typeof candidate.emittedAt === "string" &&
		typeof candidate.status === "string"
	);
}

function toHistoryUpserts(entries: unknown, sessionId: string): UpsertObject[] {
	if (!Array.isArray(entries)) {
		return [];
	}
	if (entries.every((entry) => isUpsertObject(entry))) {
		return entries;
	}
	return entries.map((entry, index) =>
		toHistoryUpsert(entry as ChatEntry, sessionId, index),
	);
}

function finalizeBridgeUpserts(state: UpsertBridgeState): UpsertObject[] {
	const emittedAt = nowIso();
	const finalized: UpsertObject[] = [];
	if (state.activeAssistantMessage) {
		finalized.push({
			type: "message",
			status: "complete",
			turnId: state.turnId,
			sessionId: state.sessionId,
			itemId: state.activeAssistantMessage.itemId,
			sourceTimestamp: state.activeAssistantMessage.sourceTimestamp,
			emittedAt,
			content: state.activeAssistantMessage.content,
			origin: "agent",
		});
	}
	if (state.activeThinkingMessage) {
		finalized.push({
			type: "thinking",
			status: "complete",
			turnId: state.turnId,
			sessionId: state.sessionId,
			itemId: state.activeThinkingMessage.itemId,
			sourceTimestamp: state.activeThinkingMessage.sourceTimestamp,
			emittedAt,
			content: state.activeThinkingMessage.content,
			providerId: state.cliType,
		});
	}
	return finalized;
}

function mapAcpEventToUpsert(
	event: AcpUpdateEvent,
	state: UpsertBridgeState,
): UpsertObject | null {
	const sourceTimestamp = nowIso();
	const emittedAt = nowIso();

	switch (event.type) {
		case "agent_message_chunk": {
			const chunk = extractFirstText(event.content);
			if (chunk.length === 0) {
				return null;
			}
			if (!state.activeAssistantMessage) {
				state.activeAssistantMessage = {
					itemId: nextItemId(state, "message"),
					content: chunk,
					sourceTimestamp,
				};
				return {
					type: "message",
					status: "create",
					turnId: state.turnId,
					sessionId: state.sessionId,
					itemId: state.activeAssistantMessage.itemId,
					sourceTimestamp,
					emittedAt,
					content: state.activeAssistantMessage.content,
					origin: "agent",
				};
			}
			state.activeAssistantMessage.content += chunk;
			state.activeAssistantMessage.sourceTimestamp = sourceTimestamp;
			return {
				type: "message",
				status: "update",
				turnId: state.turnId,
				sessionId: state.sessionId,
				itemId: state.activeAssistantMessage.itemId,
				sourceTimestamp,
				emittedAt,
				content: state.activeAssistantMessage.content,
				origin: "agent",
			};
		}

		case "user_message_chunk": {
			const content = extractFirstText(event.content);
			if (content.length === 0) {
				return null;
			}
			return {
				type: "message",
				status: "complete",
				turnId: state.turnId,
				sessionId: state.sessionId,
				itemId: nextItemId(state, "user"),
				sourceTimestamp,
				emittedAt,
				content,
				origin: "user",
			};
		}

		case "agent_thought_chunk": {
			const content = extractFirstText(event.content);
			if (content.length === 0) {
				return null;
			}
			if (!state.activeThinkingMessage) {
				state.activeThinkingMessage = {
					itemId: nextItemId(state, "thinking"),
					content,
					sourceTimestamp,
				};
				return {
					type: "thinking",
					status: "create",
					turnId: state.turnId,
					sessionId: state.sessionId,
					itemId: state.activeThinkingMessage.itemId,
					sourceTimestamp,
					emittedAt,
					content: state.activeThinkingMessage.content,
					providerId: state.cliType,
				};
			}
			state.activeThinkingMessage.content += content;
			state.activeThinkingMessage.sourceTimestamp = sourceTimestamp;
			return {
				type: "thinking",
				status: "update",
				turnId: state.turnId,
				sessionId: state.sessionId,
				itemId: state.activeThinkingMessage.itemId,
				sourceTimestamp,
				emittedAt,
				content: state.activeThinkingMessage.content,
				providerId: state.cliType,
			};
		}

		case "tool_call": {
			const callId = extractToolCallId(event);
			const existing = state.toolCallsById.get(callId);
			const toolName =
				typeof event.title === "string" && event.title.length > 0
					? event.title
					: (existing?.toolName ?? "tool_call");
			const toolArguments =
				existing?.toolArguments ?? extractToolArguments(event);
			const itemId = existing?.itemId ?? nextItemId(state, `tool:${callId}`);
			const status = resolveToolUpsertStatus(event.status, "tool_call");
			state.toolCallsById.set(callId, { itemId, toolName, toolArguments });
			const toolOutput = extractFirstText(event.content);
			const upsert: UpsertObject = {
				type: "tool_call",
				status,
				turnId: state.turnId,
				sessionId: state.sessionId,
				itemId,
				sourceTimestamp,
				emittedAt,
				toolName,
				toolArguments,
				callId,
				...(toolOutput.length > 0 ? { toolOutput } : {}),
				...(status === "error"
					? {
							toolOutputIsError: true,
							errorCode: "PROCESS_CRASH",
							errorMessage: toolOutput || `Tool call ${callId} failed`,
						}
					: {}),
			};
			if (status === "complete" || status === "error") {
				state.toolCallsById.delete(callId);
			}
			return upsert;
		}

		case "tool_call_update": {
			const callId = extractToolCallId(event);
			const existing = state.toolCallsById.get(callId);
			const toolName = existing?.toolName ?? "tool_call";
			const toolArguments = existing?.toolArguments ?? {};
			const itemId = existing?.itemId ?? nextItemId(state, `tool:${callId}`);
			const status = resolveToolUpsertStatus(event.status, "tool_call_update");
			const toolOutput = extractFirstText(event.content);
			const upsert: UpsertObject = {
				type: "tool_call",
				status,
				turnId: state.turnId,
				sessionId: state.sessionId,
				itemId,
				sourceTimestamp,
				emittedAt,
				toolName,
				toolArguments,
				callId,
				...(toolOutput.length > 0 ? { toolOutput } : {}),
				...(status === "error"
					? {
							toolOutputIsError: true,
							errorCode: "PROCESS_CRASH",
							errorMessage: toolOutput || `Tool call ${callId} failed`,
						}
					: {}),
			};
			if (status === "complete" || status === "error") {
				state.toolCallsById.delete(callId);
			} else {
				state.toolCallsById.set(callId, { itemId, toolName, toolArguments });
			}
			return upsert;
		}

		default:
			return null;
	}
}

function createTurnStartedEvent(sessionId: string, turnId: string): TurnEvent {
	const providerId = parseSessionRouting(sessionId).cliType;
	return {
		type: "turn_started",
		turnId,
		sessionId,
		modelId: providerId,
		providerId,
	};
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
			connectionId,
			streamDelivery,
			sessionCwdByCanonicalId,
			inFlightPrompts,
			disabledMessageTypes,
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
	connectionId: string,
	streamDelivery: StreamDelivery,
	sessionCwdByCanonicalId: Map<string, string>,
	inFlightPrompts: Map<string, InFlightPromptState>,
	disabledMessageTypes: Set<ClientMessage["type"]>,
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
			connectionId,
			streamDelivery,
			sessionCwdByCanonicalId,
			inFlightPrompts,
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
	connectionId: string,
	streamDelivery: StreamDelivery,
	sessionCwdByCanonicalId: Map<string, string>,
	inFlightPrompts: Map<string, InFlightPromptState>,
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
				const loadedEntries = deps.sessionManager
					? await deps.sessionManager.openSession(
							message.sessionId,
							undefined,
							message.projectId,
						)
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
				const entries = toHistoryUpserts(loadedEntries, message.sessionId);
				streamDelivery.deliverHistory(connectionId, message.sessionId, entries);
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
				const turnId = randomUUID();
				const bridgeState = createUpsertBridgeState(message.sessionId, turnId);
				const inFlightState: InFlightPromptState = {
					turnId,
					cancelRequested: false,
					completionTimer: null,
				};
				inFlightPrompts.set(message.sessionId, inFlightState);
				streamDelivery.deliverTurn(
					connectionId,
					message.sessionId,
					createTurnStartedEvent(message.sessionId, turnId),
				);

				const onEvent = (event: AcpUpdateEvent) => {
					const upsert = mapAcpEventToUpsert(event, bridgeState);
					if (upsert) {
						streamDelivery.deliverUpsert(
							connectionId,
							message.sessionId,
							upsert,
						);
					}
				};

				const promptResult = deps.sessionManager
					? await deps.sessionManager.sendMessage(
							message.sessionId,
							message.content,
							onEvent,
						)
					: await (async () => {
							const routing = parseSessionRouting(message.sessionId);
							const client = await deps.agentManager.ensureAgent(
								routing.cliType,
							);
							return client.sessionPrompt(
								routing.acpSessionId,
								message.content,
								onEvent,
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

				for (const finalizedUpsert of finalizeBridgeUpserts(bridgeState)) {
					streamDelivery.deliverUpsert(
						connectionId,
						message.sessionId,
						finalizedUpsert,
					);
				}

				const completionStatus = resolveTurnCompletionStatus(
					promptResult.stopReason,
					inFlightState.cancelRequested,
				);
				if (completionStatus === null) {
					streamDelivery.deliverTurn(connectionId, message.sessionId, {
						type: "turn_error",
						turnId,
						sessionId: message.sessionId,
						errorCode: "PROTOCOL_ERROR",
						errorMessage: `Unsupported stop reason: ${promptResult.stopReason}`,
					});
					inFlightPrompts.delete(message.sessionId);
					break;
				}

				if (completionStatus === "cancelled") {
					streamDelivery.deliverTurn(connectionId, message.sessionId, {
						type: "turn_complete",
						turnId,
						sessionId: message.sessionId,
						status: "cancelled",
					});
					inFlightPrompts.delete(message.sessionId);
					break;
				}

				if (deps.sessionManager) {
					// session:cancel can race with prompt completion in local integration.
					inFlightState.completionTimer = setTimeout(() => {
						const latestState = inFlightPrompts.get(message.sessionId);
						inFlightPrompts.delete(message.sessionId);
						if (!latestState) {
							return;
						}
						streamDelivery.deliverTurn(connectionId, message.sessionId, {
							type: "turn_complete",
							turnId: latestState.turnId,
							sessionId: message.sessionId,
							status: latestState.cancelRequested ? "cancelled" : "completed",
						});
					}, SESSION_COMPLETE_GRACE_MS);
				} else {
					streamDelivery.deliverTurn(connectionId, message.sessionId, {
						type: "turn_complete",
						turnId,
						sessionId: message.sessionId,
						status: "completed",
					});
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
				if (inFlightState) {
					streamDelivery.deliverTurn(connectionId, message.sessionId, {
						type: "turn_error",
						turnId: inFlightState.turnId,
						sessionId: message.sessionId,
						errorCode: "PROCESS_CRASH",
						errorMessage: messageText,
					});
				}
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

					if (hadCompletionTimer) {
						streamDelivery.deliverTurn(connectionId, message.sessionId, {
							type: "turn_complete",
							turnId: inFlightState.turnId,
							sessionId: message.sessionId,
							status: "cancelled",
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
				const sessions = deps.sessionManager
					? await deps.sessionManager.listSessions(message.projectId)
					: [];
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
