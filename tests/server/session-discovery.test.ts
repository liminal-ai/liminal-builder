import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { discoverClaudeSessionsFromProjectDir } from "../../server/sessions/session-discovery";

describe("discoverClaudeSessions", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "liminal-session-discovery-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("uses sessions-index.json as the default source and filters sidechains", async () => {
		const projectDir = join(
			tempDir,
			".claude",
			"projects",
			"-Users-leemoore-code-example-project",
		);
		mkdirSync(projectDir, { recursive: true });
		writeFileSync(
			join(projectDir, "sessions-index.json"),
			JSON.stringify(
				{
					version: 1,
					entries: [
						{
							sessionId: "primary-session",
							summary: "Build the native app shell",
							modified: "2026-03-05T12:00:00.000Z",
							isSidechain: false,
						},
						{
							sessionId: "sidechain-session",
							summary: "Background helper",
							modified: "2026-03-05T11:00:00.000Z",
							isSidechain: true,
						},
					],
				},
				null,
				2,
			),
		);
		writeFileSync(join(projectDir, "orphan.jsonl"), "{}\n");

		const sessions = await discoverClaudeSessionsFromProjectDir(projectDir);

		expect(sessions).toEqual([
			{
				id: "claude-code:primary-session",
				providerSessionId: "primary-session",
				title: "Build the native app shell",
				lastActiveAt: "2026-03-05T12:00:00.000Z",
				cliType: "claude-code",
			},
		]);
	});

	it("does not scan raw jsonl files when the index is missing", async () => {
		const projectDir = join(
			tempDir,
			".claude",
			"projects",
			"-Users-leemoore-code-no-index-project",
		);
		mkdirSync(projectDir, { recursive: true });
		writeFileSync(join(projectDir, "standalone-session.jsonl"), "{}\n");

		const sessions = await discoverClaudeSessionsFromProjectDir(projectDir);

		expect(sessions).toEqual([]);
	});

	it("still supports explicit jsonl fallback for non-sidebar flows", async () => {
		const projectDir = join(
			tempDir,
			".claude",
			"projects",
			"-Users-leemoore-code-import-project",
		);
		mkdirSync(projectDir, { recursive: true });
		writeFileSync(join(projectDir, "fallback-session.jsonl"), "{}\n");

		const sessions = await discoverClaudeSessionsFromProjectDir(projectDir, {
			fallbackToJsonl: true,
		});

		expect(sessions).toHaveLength(1);
		expect(sessions[0]).toMatchObject({
			id: "claude-code:fallback-session",
			cliType: "claude-code",
		});
	});
});
