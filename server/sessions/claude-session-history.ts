import { readFile } from "node:fs/promises";
import type { UpsertObject } from "../streaming/upsert-types";
import { claudeSessionJsonlPath } from "./session-discovery";

type JsonRecord = Record<string, unknown>;

type HistoryEntry =
	| {
			entryId: string;
			type: "user";
			content: string;
			timestamp: string;
	  }
	| {
			entryId: string;
			type: "assistant";
			content: string;
			timestamp: string;
	  };

type OrderedEntry = {
	order: number;
	entry: HistoryEntry;
};

type AssistantAggregate = {
	order: number;
	entryId: string;
	timestamp: string;
	content: string;
};

function nowIso(): string {
	return new Date().toISOString();
}

export async function loadClaudeSessionHistoryUpserts(
	projectPath: string,
	sessionId: string,
	canonicalSessionId: string,
): Promise<UpsertObject[]> {
	const jsonlPath = claudeSessionJsonlPath(projectPath, sessionId);

	let raw: string;
	try {
		raw = await readFile(jsonlPath, "utf-8");
	} catch {
		return [];
	}

	const orderedEntries: OrderedEntry[] = [];
	const assistantByMessageId = new Map<string, AssistantAggregate>();
	const lines = raw.split("\n");

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index]?.trim();
		if (!line) {
			continue;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(line) as unknown;
		} catch {
			continue;
		}
		const record = asRecord(parsed);
		if (!record) {
			continue;
		}

		const topLevelType = asString(record.type);
		if (topLevelType === "user") {
			const message = asRecord(record.message);
			if (asString(message?.role) !== "user") {
				continue;
			}
			const content = extractUserText(message?.content);
			if (content.trim().length === 0) {
				continue;
			}
			orderedEntries.push({
				order: index,
				entry: {
					entryId:
						asString(record.uuid) ?? `${sessionId}:user:${String(index + 1)}`,
					type: "user",
					content,
					timestamp: asString(record.timestamp) ?? nowIso(),
				},
			});
			continue;
		}

		if (topLevelType !== "assistant") {
			continue;
		}

		const message = asRecord(record.message);
		if (asString(message?.role) !== "assistant") {
			continue;
		}
		const text = extractAssistantText(message?.content);
		if (text.trim().length === 0) {
			continue;
		}
		const messageId = asString(message?.id) ?? `assistant-${String(index + 1)}`;
		const existing = assistantByMessageId.get(messageId);
		if (!existing) {
			assistantByMessageId.set(messageId, {
				order: index,
				entryId:
					asString(record.uuid) ??
					`${sessionId}:assistant:${String(index + 1)}`,
				timestamp: asString(record.timestamp) ?? nowIso(),
				content: text,
			});
			continue;
		}
		existing.content = text;
		existing.entryId = asString(record.uuid) ?? existing.entryId;
		existing.timestamp = asString(record.timestamp) ?? existing.timestamp;
	}

	for (const assistant of assistantByMessageId.values()) {
		orderedEntries.push({
			order: assistant.order,
			entry: {
				entryId: assistant.entryId,
				type: "assistant",
				content: assistant.content,
				timestamp: assistant.timestamp,
			},
		});
	}

	orderedEntries.sort((left, right) => left.order - right.order);
	return orderedEntries.map((item, index) =>
		toCanonicalHistoryUpsert(item.entry, canonicalSessionId, index),
	);
}

function toCanonicalHistoryUpsert(
	entry: HistoryEntry,
	sessionId: string,
	index: number,
): UpsertObject {
	const turnId = `history:${index + 1}`;
	const base = {
		turnId,
		sessionId,
		itemId: entry.entryId,
		sourceTimestamp: entry.timestamp,
		emittedAt: entry.timestamp,
		status: "complete" as const,
	};

	if (entry.type === "user") {
		return {
			type: "message",
			...base,
			content: entry.content,
			origin: "user",
		};
	}

	return {
		type: "message",
		...base,
		content: entry.content,
		origin: "agent",
	};
}

function extractUserText(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}
	return content
		.map((block) => {
			const blockRecord = asRecord(block);
			if (!blockRecord || asString(blockRecord.type) !== "text") {
				return "";
			}
			return asString(blockRecord.text) ?? "";
		})
		.filter((text) => text.length > 0)
		.join("\n\n");
}

function extractAssistantText(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}
	return content
		.map((block) => {
			const blockRecord = asRecord(block);
			if (!blockRecord || asString(blockRecord.type) !== "text") {
				return "";
			}
			return asString(blockRecord.text) ?? "";
		})
		.filter((text) => text.length > 0)
		.join("");
}

function asRecord(value: unknown): JsonRecord | undefined {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as JsonRecord;
	}
	return undefined;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
