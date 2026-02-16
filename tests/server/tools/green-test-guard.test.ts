import { spawnSync } from "node:child_process";
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const GUARD_SCRIPT_PATH = fileURLToPath(
	new URL("../../../tools/green-test-guard.js", import.meta.url),
);
const BASELINE_RELATIVE_PATH = ".liminal/green-test-baseline";

type CommandResult = {
	status: number | null;
	stdout: string;
	stderr: string;
};

const temporaryRepos: string[] = [];

function runCommand(
	command: string,
	args: string[],
	cwd: string,
): CommandResult {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
	});
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

function runGit(cwd: string, args: string[]): void {
	const result = runCommand("git", args, cwd);
	if (result.status !== 0) {
		throw new Error(
			`git ${args.join(" ")} failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
	}
}

function runGuard(cwd: string, args: string[]): CommandResult {
	return runCommand("bun", [GUARD_SCRIPT_PATH, ...args], cwd);
}

function writeRepoFile(
	repoPath: string,
	relativePath: string,
	content: string,
): void {
	const absolutePath = join(repoPath, relativePath);
	mkdirSync(dirname(absolutePath), { recursive: true });
	writeFileSync(absolutePath, content, "utf8");
}

function createTempRepo(): string {
	const repoPath = mkdtempSync(join(tmpdir(), "green-test-guard-"));
	temporaryRepos.push(repoPath);

	runGit(repoPath, ["init"]);
	runGit(repoPath, ["config", "user.email", "test@example.com"]);
	runGit(repoPath, ["config", "user.name", "Test User"]);
	runGit(repoPath, ["config", "commit.gpgsign", "false"]);
	runGit(repoPath, ["config", "status.showUntrackedFiles", "normal"]);

	writeRepoFile(repoPath, "README.md", "repo fixture\n");
	runGit(repoPath, ["add", "README.md"]);
	runGit(repoPath, ["commit", "-m", "initial commit"]);

	return repoPath;
}

afterEach(() => {
	for (const repoPath of temporaryRepos.splice(0)) {
		rmSync(repoPath, { recursive: true, force: true });
	}
});

describe("green-test-guard script", () => {
	it("records untracked test files when untracked directories are collapsed by git status", () => {
		const repoPath = createTempRepo();
		writeRepoFile(
			repoPath,
			"tests/server/streaming/new-upsert-processor.test.ts",
			"export {};\n",
		);

		const result = runGuard(repoPath, ["baseline-record"]);
		expect(result.status).toBe(0);

		const baseline = JSON.parse(
			readFileSync(join(repoPath, BASELINE_RELATIVE_PATH), "utf8"),
		) as {
			testEntries: Array<{ path: string; digest: string | null }>;
		};
		const recordedPaths = baseline.testEntries.map((entry) => entry.path);

		expect(recordedPaths).toContain(
			"tests/server/streaming/new-upsert-processor.test.ts",
		);
		expect(recordedPaths.some((path) => path.endsWith("/"))).toBe(false);
	});

	it("fails check when a baseline-tracked test file is modified", () => {
		const repoPath = createTempRepo();
		writeRepoFile(
			repoPath,
			"tests/server/example.test.ts",
			"export const x = 1;\n",
		);
		runGit(repoPath, ["add", "tests/server/example.test.ts"]);
		runGit(repoPath, ["commit", "-m", "add test fixture"]);

		writeRepoFile(
			repoPath,
			"tests/server/example.test.ts",
			"export const x = 2;\n",
		);
		const baselineRecord = runGuard(repoPath, ["baseline-record"]);
		expect(baselineRecord.status).toBe(0);

		writeRepoFile(
			repoPath,
			"tests/server/example.test.ts",
			"export const x = 3;\n",
		);
		const checkResult = runGuard(repoPath, ["check"]);

		expect(checkResult.status).toBe(1);
		expect(checkResult.stderr).toContain(
			"baseline-tracked test files changed after baseline",
		);
		expect(checkResult.stderr).toContain("tests/server/example.test.ts");
	});

	it("fails check when new test files are introduced after baseline", () => {
		const repoPath = createTempRepo();
		const baselineRecord = runGuard(repoPath, ["baseline-record"]);
		expect(baselineRecord.status).toBe(0);

		writeRepoFile(
			repoPath,
			"tests/server/newly-added.test.ts",
			"export const createdAfterBaseline = true;\n",
		);

		const checkResult = runGuard(repoPath, ["check"]);
		expect(checkResult.status).toBe(1);
		expect(checkResult.stderr).toContain(
			"new test file changes detected after baseline",
		);
		expect(checkResult.stderr).toContain("tests/server/newly-added.test.ts");
	});
});
