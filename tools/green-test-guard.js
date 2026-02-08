#!/usr/bin/env bun

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASELINE_RELATIVE_PATH = ".liminal/green-test-baseline";
const BASELINE_SCHEMA_VERSION = 2;

function runGit(command) {
	return execSync(`git ${command}`, { encoding: "utf8" }).trim();
}

function getRepoRoot() {
	return runGit("rev-parse --show-toplevel");
}

function getBaselinePath(repoRoot) {
	return resolve(repoRoot, BASELINE_RELATIVE_PATH);
}

function normalizePath(filePath) {
	return filePath.replaceAll("\\", "/");
}

function isTestPath(filePath) {
	const normalizedPath = normalizePath(filePath);
	return (
		/(^|\/)(__tests__|tests?|specs?)(\/|$)/i.test(normalizedPath) ||
		/(^|\/)[^/]+\.(test|spec)\.[^/]+$/i.test(normalizedPath)
	);
}

function getChangedPaths() {
	const output = execSync("git status --porcelain=v1 -z", {
		encoding: "buffer",
	}).toString("utf8");
	if (output.length === 0) {
		return [];
	}

	const fields = output.split("\0");
	fields.pop(); // trailing empty segment from -z output

	const changedPaths = [];
	for (let index = 0; index < fields.length; index += 1) {
		const entry = fields[index];
		if (!entry || entry.length < 4) {
			continue;
		}

		const status = entry.slice(0, 2);
		const path = entry.slice(3);
		changedPaths.push(normalizePath(path));

		const isRenameOrCopy =
			status[0] === "R" ||
			status[0] === "C" ||
			status[1] === "R" ||
			status[1] === "C";
		if (isRenameOrCopy && index + 1 < fields.length) {
			index += 1;
			changedPaths.push(normalizePath(fields[index]));
		}
	}

	return changedPaths;
}

function getChangedTestPaths() {
	return [...new Set(getChangedPaths().filter(isTestPath))].sort();
}

function getFileDigest(repoRoot, relativePath) {
	const absolutePath = resolve(repoRoot, relativePath);
	if (!existsSync(absolutePath)) {
		return null;
	}
	const data = readFileSync(absolutePath);
	return createHash("sha256").update(data).digest("hex");
}

function buildBaselineEntries(repoRoot, testPaths) {
	return testPaths.map((testPath) => ({
		path: testPath,
		digest: getFileDigest(repoRoot, testPath),
	}));
}

function writeBaselineFile(baselinePath, entries) {
	const baseline = {
		version: BASELINE_SCHEMA_VERSION,
		recordedAt: new Date().toISOString(),
		testEntries: entries,
	};

	mkdirSync(dirname(baselinePath), { recursive: true });
	writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

function readBaselineFile(baselinePath) {
	const raw = readFileSync(baselinePath, "utf8");
	const parsed = JSON.parse(raw);
	if (
		!parsed ||
		parsed.version !== BASELINE_SCHEMA_VERSION ||
		!Array.isArray(parsed.testEntries)
	) {
		throw new Error(
			"Baseline file is invalid. Re-run: bun run guard:test-baseline-record",
		);
	}

	for (const entry of parsed.testEntries) {
		if (
			!entry ||
			typeof entry.path !== "string" ||
			(entry.digest !== null && typeof entry.digest !== "string")
		) {
			throw new Error(
				"Baseline file is invalid. Re-run: bun run guard:test-baseline-record",
			);
		}
	}

	return parsed;
}

function commandBaselineRecord() {
	const repoRoot = getRepoRoot();
	const baselinePath = getBaselinePath(repoRoot);
	const currentTestPaths = getChangedTestPaths();
	const entries = buildBaselineEntries(repoRoot, currentTestPaths);
	writeBaselineFile(baselinePath, entries);

	console.log(
		`Recorded Green baseline at ${baselinePath} with ${currentTestPaths.length} changed test path(s).`,
	);
	if (currentTestPaths.length > 0) {
		for (const testPath of currentTestPaths) {
			console.log(`- ${testPath}`);
		}
	}
}

function commandCheck() {
	const repoRoot = getRepoRoot();
	const baselinePath = getBaselinePath(repoRoot);
	if (!existsSync(baselinePath)) {
		console.error(
			"ERROR: missing Green baseline. Run `bun run guard:test-baseline-record` before implementation.",
		);
		process.exit(1);
	}

	const baseline = readBaselineFile(baselinePath);
	const baselineEntries = baseline.testEntries.map((entry) => ({
		path: normalizePath(entry.path),
		digest: entry.digest,
	}));
	const baselineSet = new Set(baselineEntries.map((entry) => entry.path));
	const currentTestPaths = getChangedTestPaths();
	const currentPathSet = new Set(currentTestPaths);
	const newTestPaths = currentTestPaths.filter(
		(testPath) => !baselineSet.has(testPath),
	);
	const changedBaselinePaths = baselineEntries
		.filter((entry) => currentPathSet.has(entry.path))
		.map((entry) => ({
			path: entry.path,
			digest: getFileDigest(repoRoot, entry.path),
			baselineDigest: entry.digest,
		}))
		.filter((entry) => entry.digest !== entry.baselineDigest)
		.map((entry) => entry.path);

	if (newTestPaths.length > 0 || changedBaselinePaths.length > 0) {
		if (newTestPaths.length > 0) {
			console.error("ERROR: new test file changes detected after baseline:");
		}
		for (const testPath of newTestPaths) {
			console.error(`- ${testPath}`);
		}
		if (changedBaselinePaths.length > 0) {
			console.error(
				"ERROR: baseline-tracked test files changed after baseline:",
			);
			for (const testPath of changedBaselinePaths) {
				console.error(`- ${testPath}`);
			}
		}
		console.error(
			"Green rule violated: Red tests are immutable in Green. Revert test-file changes or restart from a new baseline.",
		);
		process.exit(1);
	}

	console.log(
		"Test-change guard passed: no test-file changes beyond recorded baseline snapshots.",
	);
}

function main() {
	const command = process.argv[2];
	if (command === "baseline-record") {
		commandBaselineRecord();
		return;
	}
	if (command === "check") {
		commandCheck();
		return;
	}

	console.error(
		"Usage: bun run tools/green-test-guard.js <baseline-record|check>",
	);
	process.exit(1);
}

main();
