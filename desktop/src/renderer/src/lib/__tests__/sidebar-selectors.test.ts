import { describe, expect, it } from "vitest";
import {
	buildPinnedSessionViewModels,
	cleanupPinnedSessionIds,
} from "../sidebar-selectors";

const now = new Date().toISOString();

describe("sidebar-selectors", () => {
	it("builds pinned sessions in pinned order and dedupes ids", () => {
		const sessionsByProject = {
			p1: [
				{
					id: "claude-code:a",
					projectId: "p1",
					title: "A",
					lastActiveAt: now,
					cliType: "claude-code" as const,
					source: "builder" as const,
					availability: "available" as const,
					providerSessionId: "a",
				},
			],
			p2: [
				{
					id: "claude-code:b",
					projectId: "p2",
					title: "B",
					lastActiveAt: now,
					cliType: "claude-code" as const,
					source: "builder" as const,
					availability: "available" as const,
					providerSessionId: "b",
				},
			],
		};

		const result = buildPinnedSessionViewModels(
			["claude-code:b", "claude-code:b", "claude-code:a"],
			sessionsByProject,
			{ p1: "Alpha", p2: "Beta" },
		);

		expect(result.map((entry) => entry.session.id)).toEqual([
			"claude-code:b",
			"claude-code:a",
		]);
		expect(result.map((entry) => entry.projectName)).toEqual(["Beta", "Alpha"]);
	});

	it("cleans up stale pinned sessions when sessions are missing", () => {
		const sessionsByProject = {
			p1: [
				{
					id: "claude-code:a",
					projectId: "p1",
					title: "A",
					lastActiveAt: now,
					cliType: "claude-code" as const,
					source: "builder" as const,
					availability: "available" as const,
					providerSessionId: "a",
				},
			],
		};

		const result = cleanupPinnedSessionIds(
			["claude-code:missing", "claude-code:a"],
			sessionsByProject,
		);

		expect(result).toEqual(["claude-code:a"]);
	});
});
