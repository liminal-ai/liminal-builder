/**
 * Represents a project directory configured in the app.
 *
 * Used by: project-store, websocket handler, sidebar
 * Supports: AC-1.1 (display), AC-1.2 (add), AC-1.3 (remove)
 */
export interface Project {
	/** UUID v4 generated on add */
	id: string;
	/** Absolute filesystem path */
	path: string;
	/** Display name derived from directory basename */
	name: string;
	/** ISO 8601 UTC -- determines sidebar display order (insertion order) */
	addedAt: string;
}
