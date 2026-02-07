import { NotImplementedError } from '../errors';
import type { JsonStore } from '../store/json-store';
import type { Project } from './project-types';

/**
 * CRUD operations for project configuration.
 * Validates paths, detects duplicates, persists to JSON.
 *
 * Covers: AC-1.1-1.3 (project management)
 */
export class ProjectStore {
  private store: JsonStore<Project[]>;

  constructor(store: JsonStore<Project[]>) {
    this.store = store;
  }

  /** Add project. Validates path exists, checks duplicates. */
  async addProject(path: string): Promise<Project> {
    throw new NotImplementedError('ProjectStore.addProject');
  }

  /** Remove project by ID. Retains session mappings. */
  async removeProject(projectId: string): Promise<void> {
    throw new NotImplementedError('ProjectStore.removeProject');
  }

  /** List all projects in insertion order. */
  async listProjects(): Promise<Project[]> {
    throw new NotImplementedError('ProjectStore.listProjects');
  }
}
