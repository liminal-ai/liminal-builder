import { randomUUID } from "node:crypto";
import type { AcpUpdateEvent } from "../acp/acp-types";
import type { CliType } from "../sessions/session-types";
import type { TurnEvent, UpsertObject } from "../streaming/upsert-types";

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

export type UpsertBridgeState = {
	turnId: string;
	sessionId: string;
	cliType: CliType;
	nextItemOrdinal: number;
	activeAssistantMessage: PendingContentState | null;
	activeThinkingMessage: PendingContentState | null;
	toolCallsById: Map<string, ToolCallBridgeState>;
};

function nowIso(): string {
	return new Date().toISOString();
}

function parseSessionRouting(sessionId: string): {
	cliType: CliType;
	acpSessionId: string;
} {
	const colonIndex = sessionId.indexOf(":");
	if (colonIndex > 0) {
		const maybeCliType = sessionId.substring(0, colonIndex);
		if (maybeCliType === "claude-code" || maybeCliType === "codex") {
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

export function resolveTurnCompletionStatus(
	stopReason:
		| "end_turn"
		| "max_tokens"
		| "max_turn_requests"
		| "refusal"
		| "cancelled",
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

export function createUpsertBridgeState(
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

export function finalizeBridgeUpserts(
	state: UpsertBridgeState,
): UpsertObject[] {
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

export function mapAcpEventToUpsert(
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

export function createTurnStartedEvent(
	sessionId: string,
	turnId: string,
): TurnEvent {
	const providerId = parseSessionRouting(sessionId).cliType;
	return {
		type: "turn_started",
		turnId,
		sessionId,
		modelId: providerId,
		providerId,
	};
}
