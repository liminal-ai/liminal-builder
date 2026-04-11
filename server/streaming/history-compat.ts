import type { ChatEntry } from "../../shared/types";
import type { CliType } from "../sessions/session-types";
import { enrichCanonicalUpsert } from "./canonical-upsert-enricher";
import type { UpsertObject } from "./upsert-types";

function nowIso(): string {
	return new Date().toISOString();
}

function routingCliType(sessionId: string): CliType {
	return sessionId.startsWith("codex:") ? "codex" : "claude-code";
}

export function isUpsertObject(value: unknown): value is UpsertObject {
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

export function legacyChatEntryToUpsert(
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

	const base = {
		turnId,
		sessionId,
		itemId,
		sourceTimestamp,
		emittedAt,
		status: "complete" as const,
	};

	let upsert: UpsertObject;
	switch (entry.type) {
		case "user":
			upsert = {
				type: "message",
				...base,
				content: entry.content,
				origin: "user",
			};
			break;
		case "assistant":
			upsert = {
				type: "message",
				...base,
				content: entry.content,
				origin: "agent",
			};
			break;
		case "thinking":
			upsert = {
				type: "thinking",
				...base,
				content: entry.content,
				providerId: routingCliType(sessionId),
			};
			break;
		case "tool-call": {
			const isError = entry.status === "error";
			const toolOutput = isError ? entry.error : entry.result;
			upsert = {
				type: "tool_call",
				...base,
				status: isError ? "error" : "complete",
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
			break;
		}
	}

	return enrichCanonicalUpsert(upsert, {
		itemOrder: index + 1,
		turnOrder: index + 1,
	});
}

export function toHistoryUpserts(
	entries: unknown,
	sessionId: string,
): UpsertObject[] {
	if (!Array.isArray(entries)) {
		return [];
	}
	if (entries.every((entry) => isUpsertObject(entry))) {
		return entries;
	}
	return entries.map((entry, index) =>
		legacyChatEntryToUpsert(entry as ChatEntry, sessionId, index),
	);
}
