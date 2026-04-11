import type { SessionMeta, SessionPromptResult } from "./session-types";
import type { SessionTitleOverrideStore } from "./session-title-overrides";

export class SessionTitleService {
	constructor(
		private readonly titleOverrideStore?: SessionTitleOverrideStore,
	) {}

	reloadOverrides(): void {
		this.titleOverrideStore?.reloadSync();
	}

	applyTitle(canonicalId: string, fallbackTitle: string): string {
		return (
			this.titleOverrideStore?.applyTitle(canonicalId, fallbackTitle) ??
			fallbackTitle
		);
	}

	deriveTitle(content: string): string {
		const maxLen = 50;
		const trimmed = content.trim();
		if (trimmed.length <= maxLen) {
			return trimmed;
		}

		const truncated = trimmed.substring(0, maxLen);
		const lastSpace = truncated.lastIndexOf(" ");
		if (lastSpace > 20) {
			return `${truncated.substring(0, lastSpace)}...`;
		}
		return `${truncated}...`;
	}

	maybeApplyInitialPromptTitle(
		session: SessionMeta,
		content: string,
	): SessionPromptResult["titleUpdated"] {
		if (session.title !== "New Session") {
			return undefined;
		}
		const nextTitle = this.deriveTitle(content);
		session.title = nextTitle;
		return nextTitle;
	}

	setManualTitle(canonicalId: string, title: string): void {
		this.titleOverrideStore?.setOverrideSyncBlocking(canonicalId, {
			title,
			updatedAt: new Date().toISOString(),
			source: "manual",
		});
	}
}
