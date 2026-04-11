import type { JsonStore } from "../store/json-store";

export interface SessionTitleOverride {
	title: string;
	updatedAt: string;
	source: "manual" | "codex-spark" | "claude-sonnet";
	confidence?: number;
	reason?: string;
}

export type SessionTitleOverrideIndex = Record<string, SessionTitleOverride>;

export class SessionTitleOverrideStore {
	private overrides: SessionTitleOverrideIndex;

	constructor(private readonly store: JsonStore<SessionTitleOverrideIndex>) {
		this.overrides = this.store.readSync();
	}

	reloadSync(): void {
		this.overrides = this.store.readSync();
	}

	getTitle(canonicalId: string): string | undefined {
		return this.overrides[canonicalId]?.title;
	}

	getOverride(canonicalId: string): SessionTitleOverride | undefined {
		return this.overrides[canonicalId];
	}

	list(): SessionTitleOverrideIndex {
		return { ...this.overrides };
	}

	async setOverride(
		canonicalId: string,
		override: SessionTitleOverride,
	): Promise<void> {
		this.overrides[canonicalId] = override;
		await this.store.writeSync(this.overrides);
	}

	setOverrideSyncBlocking(
		canonicalId: string,
		override: SessionTitleOverride,
	): void {
		this.overrides[canonicalId] = override;
		this.store.writeSyncBlocking(this.overrides);
	}

	applyTitle(canonicalId: string, fallbackTitle: string): string {
		return this.getTitle(canonicalId) ?? fallbackTitle;
	}
}
