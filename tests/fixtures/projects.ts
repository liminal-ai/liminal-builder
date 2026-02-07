import type { Project } from "../../server/projects/project-types";

/** A valid mock project for testing */
export const MOCK_PROJECT_A: Project = {
	id: "proj-aaa-111",
	path: "/Users/test/code/project-alpha",
	name: "project-alpha",
	addedAt: "2026-01-15T10:00:00.000Z",
};

/** A second valid mock project for testing ordering */
export const MOCK_PROJECT_B: Project = {
	id: "proj-bbb-222",
	path: "/Users/test/code/project-beta",
	name: "project-beta",
	addedAt: "2026-01-15T11:00:00.000Z",
};

/** A third mock project */
export const MOCK_PROJECT_C: Project = {
	id: "proj-ccc-333",
	path: "/Users/test/code/project-gamma",
	name: "project-gamma",
	addedAt: "2026-01-15T12:00:00.000Z",
};

/** Mock project list (insertion order) */
export const MOCK_PROJECTS: Project[] = [MOCK_PROJECT_A, MOCK_PROJECT_B];

/** A path that simulates a valid directory */
export const VALID_DIR_PATH = "/Users/test/code/new-project";

/** A path that simulates an invalid (nonexistent) directory */
export const INVALID_DIR_PATH = "/Users/test/code/does-not-exist";
