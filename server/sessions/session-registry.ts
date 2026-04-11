import type { JsonStore } from "../store/json-store";
import type { SessionMeta, SessionRegistryPort } from "./session-types";

export class SessionRegistry implements SessionRegistryPort {
	private sessions: SessionMeta[];

	constructor(private readonly store: JsonStore<SessionMeta[]>) {
		this.sessions = this.store.readSync();
	}

	listAll(): SessionMeta[] {
		return [...this.sessions];
	}

	listByProject(projectId: string): SessionMeta[] {
		return this.sessions.filter((session) => session.projectId === projectId);
	}

	get(canonicalId: string): SessionMeta | undefined {
		return this.sessions.find((session) => session.id === canonicalId);
	}

	async create(meta: SessionMeta): Promise<SessionMeta> {
		this.sessions.push(meta);
		await this.store.writeSync(this.sessions);
		return meta;
	}

	async adopt(meta: SessionMeta): Promise<SessionMeta> {
		const existing = this.get(meta.id);
		if (existing) {
			return this.update(meta.id, () => ({
				...existing,
				...meta,
				source: "adopted",
			}));
		}
		return this.create({
			...meta,
			source: "adopted",
		});
	}

	async update(
		canonicalId: string,
		updater: (session: SessionMeta) => SessionMeta,
	): Promise<SessionMeta> {
		const index = this.sessions.findIndex(
			(session) => session.id === canonicalId,
		);
		if (index === -1) {
			throw new Error("Session not found");
		}
		const next = updater(this.sessions[index]);
		this.sessions[index] = next;
		await this.store.writeSync(this.sessions);
		return next;
	}

	updateSyncBlocking(
		canonicalId: string,
		updater: (session: SessionMeta) => SessionMeta,
	): SessionMeta {
		const index = this.sessions.findIndex(
			(session) => session.id === canonicalId,
		);
		if (index === -1) {
			throw new Error("Session not found");
		}
		const next = updater(this.sessions[index]);
		this.sessions[index] = next;
		this.store.writeSyncBlocking(this.sessions);
		return next;
	}

	archive(canonicalId: string): SessionMeta {
		return this.updateSyncBlocking(canonicalId, (session) => ({
			...session,
			archived: true,
		}));
	}
}
