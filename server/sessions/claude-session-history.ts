import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import type { ChatEntry } from "../../shared/types";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

type JsonRecord = Record<string, unknown>;

type OrderedEntry = {
	order: number;
	entry: ChatEntry;
};

type AssistantAggregate = {
	order: number;
	entryId: string;
	timestamp: string;
	content: string;
};

export async function loadClaudeSessionHistory(
	projectPath: string,
	sessionId: string,
): Promise<ChatEntry[]> {
	const slug = projectPathToSlug(projectPath);
	const jsonlPath = join(CLAUDE_PROJECTS_DIR, slug, `${sessionId}.jsonl`);

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
					timestamp: asString(record.timestamp) ?? new Date().toISOString(),
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
				timestamp: asString(record.timestamp) ?? new Date().toISOString(),
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

	orderedEntries.sort((a, b) => a.order - b.order);
	return orderedEntries.map((item) => item.entry);
}

function projectPathToSlug(projectPath: string): string {
	return projectPath.split(sep).join("-");
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
