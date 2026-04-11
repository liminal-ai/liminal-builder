import {
	createReadStream,
	existsSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { JsonStore } from "../../server/store/json-store";
import {
	SessionTitleOverrideStore,
	type SessionTitleOverrideIndex,
} from "../../server/sessions/session-title-overrides";
import {
	deriveClaudeTitle,
	type ClaudeIndexEntry,
} from "../../server/sessions/session-discovery";

type RenameAction = "keep" | "rename";

interface RenameDecision {
	action: RenameAction;
	title: string;
	confidence: number;
	reason: string;
}

interface CandidateSession {
	canonicalId: string;
	projectPath: string;
	fullPath: string;
	currentTitle: string;
	summary?: string;
	firstPrompt?: string;
	messageCount?: number;
	created?: string;
	modified?: string;
}

interface SessionSample {
	firstUserMessages: string[];
	firstAssistantMessages: string[];
}

interface RunnerResult {
	decision: RenameDecision;
	model: "codex-spark" | "claude-sonnet";
}

interface CliOptions {
	apply: boolean;
	limit?: number;
	concurrency: number;
	projectFilter?: string;
	all: boolean;
	force: boolean;
}

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const TITLE_OVERRIDES_FILE = join(
	homedir(),
	".liminal-builder",
	"session-title-overrides.json",
);
const MODEL_SCHEMA = {
	type: "object",
	properties: {
		action: { type: "string", enum: ["keep", "rename"] },
		title: { type: "string" },
		confidence: { type: "number", minimum: 0, maximum: 1 },
		reason: { type: "string" },
	},
	required: ["action", "title", "confidence", "reason"],
	additionalProperties: false,
} as const;

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const overrideStore = new SessionTitleOverrideStore(
		new JsonStore<SessionTitleOverrideIndex>(
			{ filePath: TITLE_OVERRIDES_FILE, writeDebounceMs: 0 },
			{},
		),
	);
	const existingOverrides = overrideStore.list();
	const candidates = await loadCandidates(options, existingOverrides);

	console.log(
		`[retitle] candidates=${candidates.length} apply=${options.apply} concurrency=${options.concurrency}`,
	);

	const results = await mapLimit(
		candidates,
		options.concurrency,
		async (candidate, index) => {
			console.log(
				`[retitle] ${index + 1}/${candidates.length} ${candidate.canonicalId} :: ${candidate.currentTitle}`,
			);
			const sample = await sampleSession(candidate.fullPath);
			const sparkResult = await runCodexSpark(candidate, sample);
			if (
				sparkResult.decision.action === "rename" &&
				sparkResult.decision.confidence >= 0.72
			) {
				return { candidate, result: sparkResult };
			}
			if (
				sparkResult.decision.action === "keep" &&
				sparkResult.decision.confidence >= 0.8
			) {
				return { candidate, result: sparkResult };
			}
			const sonnetResult = await runClaudeSonnet(candidate, sample);
			return { candidate, result: sonnetResult };
		},
	);

	for (const { candidate, result } of results) {
		const decision = result.decision;
		console.log(
			`[retitle] ${result.model} ${decision.action.toUpperCase()} ${candidate.canonicalId} => ${decision.title} (${decision.confidence.toFixed(2)})`,
		);
		if (!options.apply) {
			continue;
		}
		if (decision.action === "rename") {
			await overrideStore.setOverride(candidate.canonicalId, {
				title: decision.title,
				updatedAt: new Date().toISOString(),
				source: result.model,
				confidence: decision.confidence,
				reason: decision.reason,
			});
		}
	}

	const renamedCount = results.filter(
		({ result }) => result.decision.action === "rename",
	).length;
	const keptCount = results.length - renamedCount;
	console.log(`[retitle] complete renamed=${renamedCount} kept=${keptCount}`);
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		apply: false,
		concurrency: 2,
		all: false,
		force: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--apply") {
			options.apply = true;
			continue;
		}
		if (arg === "--all") {
			options.all = true;
			continue;
		}
		if (arg === "--force") {
			options.force = true;
			continue;
		}
		if (arg === "--limit") {
			options.limit = Number(argv[index + 1]);
			index += 1;
			continue;
		}
		if (arg === "--concurrency") {
			options.concurrency = Number(argv[index + 1] ?? "2");
			index += 1;
			continue;
		}
		if (arg === "--project") {
			options.projectFilter = argv[index + 1];
			index += 1;
		}
	}

	return options;
}

async function loadCandidates(
	options: CliOptions,
	existingOverrides: SessionTitleOverrideIndex,
): Promise<CandidateSession[]> {
	const indexPaths = await new Bun.Glob("*/sessions-index.json").scan({
		cwd: CLAUDE_PROJECTS_DIR,
		absolute: true,
	});
	const candidates: CandidateSession[] = [];

	for await (const indexPath of indexPaths) {
		const raw = readFileSync(indexPath, "utf-8");
		const data = JSON.parse(raw) as { entries?: ClaudeIndexEntry[] };
		for (const entry of data.entries ?? []) {
			if (entry.isSidechain || !entry.sessionId || !entry.fullPath) {
				continue;
			}
			if (
				options.projectFilter &&
				!entry.projectPath?.includes(options.projectFilter)
			) {
				continue;
			}
			if (!existsSync(entry.fullPath)) {
				continue;
			}
			const canonicalId = `claude-code:${entry.sessionId}`;
			if (!options.force && existingOverrides[canonicalId]) {
				continue;
			}
			const currentTitle = deriveClaudeTitle(entry);
			if (!options.all && !needsReview(currentTitle)) {
				continue;
			}
			candidates.push({
				canonicalId,
				projectPath: entry.projectPath ?? "",
				fullPath: entry.fullPath,
				currentTitle,
				summary: entry.summary,
				firstPrompt: entry.firstPrompt,
				messageCount: entry.messageCount,
				created: entry.created,
				modified: entry.modified,
			});
		}
	}

	candidates.sort((a, b) =>
		(b.modified ?? b.created ?? "").localeCompare(
			a.modified ?? a.created ?? "",
		),
	);
	return options.limit ? candidates.slice(0, options.limit) : candidates;
}

function needsReview(title: string): boolean {
	const trimmed = title.trim();
	return (
		trimmed.length === 0 ||
		/^Session [0-9a-f]{8}/i.test(trimmed) ||
		/<[^>]+>/.test(trimmed) ||
		trimmed.startsWith("Clone:") ||
		trimmed.length > 72
	);
}

async function sampleSession(filePath: string): Promise<SessionSample> {
	const firstUserMessages: string[] = [];
	const firstAssistantMessages: string[] = [];
	const stream = createReadStream(filePath, { encoding: "utf-8" });
	const rl = createInterface({ input: stream, crlfDelay: Infinity });

	try {
		for await (const line of rl) {
			if (!line.trim()) {
				continue;
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				continue;
			}
			const record = parsed as {
				type?: string;
				message?: { content?: unknown };
			};
			if (record.type !== "user" && record.type !== "assistant") {
				continue;
			}
			const text = extractClaudeMessageText(record.message?.content);
			if (!text) {
				continue;
			}
			if (record.type === "user" && firstUserMessages.length < 3) {
				firstUserMessages.push(text);
			}
			if (record.type === "assistant" && firstAssistantMessages.length < 2) {
				firstAssistantMessages.push(text);
			}
			if (firstUserMessages.length >= 3 && firstAssistantMessages.length >= 2) {
				break;
			}
		}
	} finally {
		rl.close();
		stream.close();
	}

	return { firstUserMessages, firstAssistantMessages };
}

function extractClaudeMessageText(content: unknown): string {
	if (typeof content === "string") {
		return sanitizeText(content);
	}
	if (!Array.isArray(content)) {
		return "";
	}
	const text = content
		.map((part) => {
			if (!part || typeof part !== "object") {
				return "";
			}
			const typed = part as { type?: string; text?: string };
			return typed.type === "text" && typeof typed.text === "string"
				? typed.text
				: "";
		})
		.join("\n");
	return sanitizeText(text);
}

function sanitizeText(input: string): string {
	return input.replace(/\s+/g, " ").trim().slice(0, 1200);
}

function buildPrompt(
	candidate: CandidateSession,
	sample: SessionSample,
): string {
	return [
		"You are renaming Claude Code coding sessions for a desktop sidebar.",
		"Decide whether the current title should be kept or replaced.",
		"",
		"Rules:",
		"- Keep titles concise, human-readable, and specific.",
		"- Prefer 4-8 words, absolute max 60 characters.",
		"- Remove XML/protocol wrappers and prompt boilerplate.",
		"- Do not include raw tags like <command-message>.",
		"- If the current title is already accurate and readable, return action=keep and title unchanged.",
		"- Focus on the actual work/session intent, not generic clone mechanics.",
		"",
		`Current title: ${candidate.currentTitle}`,
		`Project path: ${candidate.projectPath}`,
		`Message count: ${candidate.messageCount ?? "unknown"}`,
		`Index summary: ${candidate.summary ?? ""}`,
		`First prompt: ${candidate.firstPrompt ?? ""}`,
		"",
		"Transcript sample:",
		...sample.firstUserMessages.map(
			(text, index) => `User ${index + 1}: ${text}`,
		),
		...sample.firstAssistantMessages.map(
			(text, index) => `Assistant ${index + 1}: ${text}`,
		),
	].join("\n");
}

async function runCodexSpark(
	candidate: CandidateSession,
	sample: SessionSample,
): Promise<RunnerResult> {
	const tempDir = mkdtempSync(join(tmpdir(), "liminal-retitle-codex-"));
	try {
		const schemaPath = join(tempDir, "schema.json");
		const outputPath = join(tempDir, "result.json");
		writeFileSync(schemaPath, JSON.stringify(MODEL_SCHEMA), "utf-8");
		const prompt = buildPrompt(candidate, sample);
		await execWithInput(
			"codex",
			[
				"exec",
				"--skip-git-repo-check",
				"--json",
				"-m",
				"gpt-5.3-codex-spark",
				"-c",
				"model_reasoning_effort=medium",
				"-s",
				"read-only",
				"--output-schema",
				schemaPath,
				"-o",
				outputPath,
				"-",
			],
			prompt,
		);
		const parsed = JSON.parse(
			readFileSync(outputPath, "utf-8"),
		) as RenameDecision;
		return {
			decision: normalizeDecision(parsed, candidate.currentTitle),
			model: "codex-spark",
		};
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

async function runClaudeSonnet(
	candidate: CandidateSession,
	sample: SessionSample,
): Promise<RunnerResult> {
	const prompt = buildPrompt(candidate, sample);
	const schema = JSON.stringify(MODEL_SCHEMA);
	const stdout = await execWithInput(
		"claude",
		[
			"-p",
			"--model",
			"sonnet",
			"--output-format",
			"json",
			"--json-schema",
			schema,
			"--permission-mode",
			"plan",
			"--tools",
			"",
			"--no-session-persistence",
			"-",
		],
		prompt,
	);
	const parsed = parseClaudeJsonResult(stdout);
	return {
		decision: normalizeDecision(parsed, candidate.currentTitle),
		model: "claude-sonnet",
	};
}

function parseClaudeJsonResult(stdout: string): RenameDecision {
	const trimmed = stdout.trim();
	if (trimmed.startsWith("{")) {
		return JSON.parse(trimmed) as RenameDecision;
	}
	const parsed = JSON.parse(trimmed) as { result?: RenameDecision };
	if (!parsed.result) {
		throw new Error("Claude Sonnet response missing result payload");
	}
	return parsed.result;
}

function normalizeDecision(
	decision: RenameDecision,
	currentTitle: string,
): RenameDecision {
	const normalizedTitle = decision.title
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 60);
	return {
		action: decision.action,
		title:
			decision.action === "keep"
				? currentTitle
				: normalizedTitle.length > 0
					? normalizedTitle
					: currentTitle,
		confidence: Math.max(0, Math.min(1, decision.confidence)),
		reason: decision.reason.trim(),
	};
}

async function execWithInput(
	command: string,
	args: string[],
	input: string,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: process.cwd(),
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve(stdout);
				return;
			}
			reject(
				new Error(
					`${command} exited with code ${code}\n${stderr.trim() || stdout.trim()}`,
				),
			);
		});
		child.stdin.write(input);
		child.stdin.end();
	});
}

async function mapLimit<TInput, TOutput>(
	values: TInput[],
	concurrency: number,
	mapper: (value: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
	const results = new Array<TOutput>(values.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (nextIndex < values.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			results[currentIndex] = await mapper(values[currentIndex], currentIndex);
		}
	}

	const workerCount = Math.max(1, Math.min(concurrency, values.length));
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

await main();
