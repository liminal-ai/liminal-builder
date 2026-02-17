import { homedir } from "node:os";
import { join, sep } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import type { SessionListItem, CliType } from "./session-types";

/**
 * Discovers pre-existing Claude Code and Codex sessions from
 * their native filesystem storage. These sessions were created
 * outside the Builder UI (via CLI directly) and should appear
 * in the sidebar alongside Builder-created sessions.
 */

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const CODEX_SESSIONS_DIR = join(homedir(), ".codex", "sessions");
const CODEX_STATE_FILE = join(homedir(), ".codex", ".codex-global-state.json");

/** How many days back to scan for Codex sessions (perf guard) */
const CODEX_SCAN_DAYS = 90;

// ── Claude Code ──────────────────────────────────────────────

/**
 * Claude Code stores sessions per-project at:
 *   ~/.claude/projects/<slug>/
 * where slug = projectPath with "/" replaced by "-"
 *
 * If sessions-index.json exists, use it (fast).
 * Otherwise, scan .jsonl files (slow fallback).
 */
export async function discoverClaudeSessions(
	projectPath: string,
): Promise<SessionListItem[]> {
	const slug = projectPathToSlug(projectPath);
	const projectDir = join(CLAUDE_PROJECTS_DIR, slug);

	if (!existsSync(projectDir)) {
		return [];
	}

	const indexPath = join(projectDir, "sessions-index.json");
	if (existsSync(indexPath)) {
		return parseClaudeIndex(indexPath);
	}

	return scanClaudeJsonlFiles(projectDir);
}

function projectPathToSlug(projectPath: string): string {
	return projectPath.split(sep).join("-");
}

interface ClaudeIndexEntry {
	sessionId: string;
	firstPrompt?: string;
	summary?: string;
	messageCount?: number;
	created?: string;
	modified?: string;
	projectPath?: string;
	isSidechain?: boolean;
}

function parseClaudeIndex(indexPath: string): SessionListItem[] {
	try {
		const raw = readFileSync(indexPath, "utf-8");
		const data = JSON.parse(raw) as {
			version?: number;
			entries?: ClaudeIndexEntry[];
		};
		if (!Array.isArray(data.entries)) {
			return [];
		}
		return data.entries
			.filter((entry) => !entry.isSidechain)
			.map((entry) => ({
				id: `claude-code:${entry.sessionId}`,
				title: deriveClaudeTitle(entry),
				lastActiveAt:
					entry.modified ?? entry.created ?? new Date().toISOString(),
				cliType: "claude-code" as CliType,
			}));
	} catch {
		return [];
	}
}

function deriveClaudeTitle(entry: ClaudeIndexEntry): string {
	if (entry.summary && entry.summary.length > 0) {
		const cleaned = entry.summary
			.replace(/<[^>]+>/g, "")
			.replace(/\s+/g, " ")
			.trim();
		if (cleaned.length > 0) {
			return cleaned.length > 60 ? `${cleaned.substring(0, 57)}...` : cleaned;
		}
	}
	if (entry.firstPrompt && entry.firstPrompt.length > 0) {
		const cleaned = entry.firstPrompt
			.replace(/<[^>]+>/g, "")
			.replace(/\s+/g, " ")
			.trim();
		if (cleaned.length > 0) {
			return cleaned.length > 60 ? `${cleaned.substring(0, 57)}...` : cleaned;
		}
	}
	return `Session ${entry.sessionId.substring(0, 8)}`;
}

async function scanClaudeJsonlFiles(
	projectDir: string,
): Promise<SessionListItem[]> {
	try {
		const files = await readdir(projectDir);
		const jsonlFiles = files.filter(
			(f) => f.endsWith(".jsonl") && !f.startsWith("."),
		);
		const sessions: SessionListItem[] = [];

		for (const file of jsonlFiles) {
			const sessionId = file.replace(".jsonl", "");
			const filePath = join(projectDir, file);
			try {
				const fileStat = await stat(filePath);
				sessions.push({
					id: `claude-code:${sessionId}`,
					title: `Session ${sessionId.substring(0, 8)}`,
					lastActiveAt: fileStat.mtime.toISOString(),
					cliType: "claude-code",
				});
			} catch {
				// skip unreadable files
			}
		}
		return sessions;
	} catch {
		return [];
	}
}

// ── Codex ────────────────────────────────────────────────────

/**
 * Codex stores sessions at:
 *   ~/.codex/sessions/<year>/<month>/<day>/<file>.jsonl
 * First JSONL line has type:"session_meta" with payload.cwd.
 * Titles live in ~/.codex/.codex-global-state.json → thread-titles.titles
 */
export async function discoverCodexSessions(
	projectPath: string,
): Promise<SessionListItem[]> {
	if (!existsSync(CODEX_SESSIONS_DIR)) {
		return [];
	}

	const titles = loadCodexTitles();
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - CODEX_SCAN_DAYS);

	const sessions: SessionListItem[] = [];

	try {
		const years = await readdir(CODEX_SESSIONS_DIR);
		for (const year of years) {
			const yearPath = join(CODEX_SESSIONS_DIR, year);
			const yearStat = await safeStat(yearPath);
			if (!yearStat?.isDirectory()) continue;

			const months = await readdir(yearPath);
			for (const month of months) {
				const monthPath = join(yearPath, month);
				const monthStat = await safeStat(monthPath);
				if (!monthStat?.isDirectory()) continue;

				const days = await readdir(monthPath);
				for (const day of days) {
					const dayPath = join(monthPath, day);
					const dayStat = await safeStat(dayPath);
					if (!dayStat?.isDirectory()) continue;

					// Date-based cutoff
					const folderDate = new Date(`${year}-${month}-${day}`);
					if (folderDate < cutoff) continue;

					const files = await readdir(dayPath);
					for (const file of files) {
						if (!file.endsWith(".jsonl")) continue;
						const filePath = join(dayPath, file);
						const meta = await readCodexSessionMeta(filePath);
						if (!meta) continue;
						if (!cwdMatchesProject(meta.cwd, projectPath)) continue;

						const title =
							titles.get(meta.id) ?? `Codex ${meta.id.substring(0, 8)}`;

						sessions.push({
							id: `codex:${meta.id}`,
							title,
							lastActiveAt: meta.timestamp ?? new Date().toISOString(),
							cliType: "codex",
						});
					}
				}
			}
		}
	} catch {
		// filesystem errors — return what we have
	}

	return sessions;
}

interface CodexSessionMeta {
	id: string;
	cwd: string;
	timestamp?: string;
}

async function readCodexSessionMeta(
	filePath: string,
): Promise<CodexSessionMeta | null> {
	try {
		const content = await readFile(filePath, "utf-8");
		const firstNewline = content.indexOf("\n");
		const firstLine =
			firstNewline > 0 ? content.substring(0, firstNewline) : content;
		const parsed = JSON.parse(firstLine) as {
			type?: string;
			payload?: { id?: string; cwd?: string; timestamp?: string };
		};

		if (parsed.type !== "session_meta" || !parsed.payload) {
			return null;
		}
		const { id, cwd, timestamp } = parsed.payload;
		if (typeof id !== "string" || typeof cwd !== "string") {
			return null;
		}
		return { id, cwd, timestamp };
	} catch {
		return null;
	}
}

function loadCodexTitles(): Map<string, string> {
	const map = new Map<string, string>();
	try {
		const raw = readFileSync(CODEX_STATE_FILE, "utf-8");
		const data = JSON.parse(raw) as {
			"thread-titles"?: { titles?: Record<string, string> };
		};
		const titles = data["thread-titles"]?.titles;
		if (titles && typeof titles === "object") {
			for (const [id, title] of Object.entries(titles)) {
				if (typeof title === "string") {
					map.set(id, title);
				}
			}
		}
	} catch {
		// no titles available
	}
	return map;
}

function cwdMatchesProject(cwd: string, projectPath: string): boolean {
	// Normalize trailing slashes
	const normCwd = cwd.replace(/\/+$/, "");
	const normProject = projectPath.replace(/\/+$/, "");
	return normCwd === normProject;
}

async function safeStat(
	path: string,
): Promise<Awaited<ReturnType<typeof stat>> | null> {
	try {
		return await stat(path);
	} catch {
		return null;
	}
}

// ── Combined ─────────────────────────────────────────────────

/**
 * Discover all sessions (both Claude Code and Codex) for a project path.
 * Returns deduplicated SessionListItem[], sorted by lastActiveAt descending.
 */
export async function discoverAllSessions(
	projectPath: string,
): Promise<SessionListItem[]> {
	const [claudeSessions, codexSessions] = await Promise.all([
		discoverClaudeSessions(projectPath),
		discoverCodexSessions(projectPath),
	]);

	const all = [...claudeSessions, ...codexSessions];

	// Sort by most recent first
	all.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));

	return all;
}
