import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStore } from "../../server/projects/project-store";
import type { Project } from "../../server/projects/project-types";
import { JsonStore } from "../../server/store/json-store";

describe("ProjectStore", () => {
	let store: JsonStore<Project[]>;
	let projectStore: ProjectStore;
	let tempDir: string;
	let projectAlphaPath: string;
	let projectBetaPath: string;
	let myAppPath: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "liminal-test-"));
		projectAlphaPath = join(tempDir, "project-alpha");
		projectBetaPath = join(tempDir, "project-beta");
		myAppPath = join(tempDir, "my-app");
		mkdirSync(projectAlphaPath);
		mkdirSync(projectBetaPath);
		mkdirSync(myAppPath);

		const filePath = join(tempDir, "projects.json");
		store = new JsonStore<Project[]>({ filePath, writeDebounceMs: 0 }, []);
		projectStore = new ProjectStore(store);
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("TC-1.1a: projects returned in insertion order", async () => {
		const projectA = await projectStore.addProject(projectAlphaPath);
		const projectB = await projectStore.addProject(projectBetaPath);

		const projects = await projectStore.listProjects();

		expect(projects).toHaveLength(2);
		expect(projects[0]?.id).toBe(projectA.id);
		expect(projects[1]?.id).toBe(projectB.id);
		expect(projects[0]?.path).toBe(projectAlphaPath);
		expect(projects[1]?.path).toBe(projectBetaPath);
		expect(projects[0]?.name).toBe("project-alpha");
		expect(projects[1]?.name).toBe("project-beta");
	});

	it("TC-1.2a: add valid directory creates project", async () => {
		const project = await projectStore.addProject(myAppPath);

		expect(project.id).toBeDefined();
		expect(typeof project.id).toBe("string");
		expect(project.id.length).toBeGreaterThan(0);
		expect(project.path).toBe(myAppPath);
		expect(project.name).toBe("my-app");
		expect(project.addedAt).toBeDefined();
		expect(new Date(project.addedAt).toISOString()).toBe(project.addedAt);

		const projects = await projectStore.listProjects();
		expect(projects).toHaveLength(1);
		expect(projects[0]).toEqual(project);
	});

	it("TC-1.2b: add nonexistent directory throws", async () => {
		const missingPath = join(tempDir, "does-not-exist");

		await expect(projectStore.addProject(missingPath)).rejects.toMatchObject({
			name: "AppError",
		});

		const projects = await store.read();
		expect(projects).toHaveLength(0);
	});

	it("TC-1.2d: add duplicate directory throws", async () => {
		await projectStore.addProject(myAppPath);

		await expect(projectStore.addProject(myAppPath)).rejects.toThrow(
			/already added|duplicate/i,
		);

		const projects = await store.read();
		expect(projects).toHaveLength(1);
		expect(projects[0]?.path).toBe(myAppPath);
	});

	it("TC-1.3a: removeProject deletes project (session data untouched -- verified by store separation, full re-add flow in Story 4)", async () => {
		const sessionsPath = join(tempDir, "sessions.json");
		const sentinelSessions = JSON.stringify(
			{ version: 1, data: [{ id: "session-1", projectId: "old-project-id" }] },
			null,
			2,
		);
		writeFileSync(sessionsPath, sentinelSessions, "utf-8");

		const project = await projectStore.addProject(myAppPath);
		await projectStore.removeProject(project.id);

		const projects = await projectStore.listProjects();
		expect(projects).toHaveLength(0);
		expect(readFileSync(sessionsPath, "utf-8")).toBe(sentinelSessions);
	});
});
