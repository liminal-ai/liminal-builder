import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { AppError } from "../errors";
import type { JsonStore } from "../store/json-store";
import type { Project } from "./project-types";

/**
 * CRUD operations for project configuration.
 * Validates paths, detects duplicates, persists to JSON.
 *
 * Covers: AC-1.1-1.3 (project management)
 */
export class ProjectStore {
	constructor(public store: JsonStore<Project[]>) {}

	/** Add project. Validates path exists, checks duplicates. */
	async addProject(path: string): Promise<Project> {
		const exists = await Bun.file(path).exists();
		if (!exists) {
			throw new AppError("INVALID_PATH", `Directory does not exist: ${path}`);
		}

		const projects = await this.store.read();
		if (projects.some((project) => project.path === path)) {
			throw new AppError("DUPLICATE_PROJECT", "Project already added");
		}

		const project: Project = {
			id: randomUUID(),
			path,
			name: basename(path),
			addedAt: new Date().toISOString(),
		};

		projects.push(project);
		await this.store.write(projects);

		return project;
	}

	/** Remove project by ID. Retains session mappings. */
	async removeProject(projectId: string): Promise<void> {
		const projects = await this.store.read();
		const remaining = projects.filter((project) => project.id !== projectId);

		if (remaining.length === projects.length) {
			throw new AppError("NOT_FOUND", "Project not found");
		}

		await this.store.write(remaining);
	}

	/** List all projects in insertion order. */
	async listProjects(): Promise<Project[]> {
		return this.store.read();
	}
}
