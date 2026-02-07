import { NotImplementedError } from "../errors";
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
	async addProject(_path: string): Promise<Project> {
		throw new NotImplementedError("ProjectStore.addProject");
	}

	/** Remove project by ID. Retains session mappings. */
	async removeProject(_projectId: string): Promise<void> {
		throw new NotImplementedError("ProjectStore.removeProject");
	}

	/** List all projects in insertion order. */
	async listProjects(): Promise<Project[]> {
		throw new NotImplementedError("ProjectStore.listProjects");
	}
}
