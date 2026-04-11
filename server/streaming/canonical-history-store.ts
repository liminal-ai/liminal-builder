import type { CliType } from "../sessions/session-types";
import type { JsonStore } from "../store/json-store";
import { enrichCanonicalUpsert } from "./canonical-upsert-enricher";
import type { UpsertObject } from "./upsert-types";

export interface SessionCanonicalHistory {
	sessionId: string;
	cliType: CliType;
	updatedAt: string;
	upserts: UpsertObject[];
}

export type CanonicalHistoryIndex = Record<string, SessionCanonicalHistory>;

function sortUpserts(upserts: UpsertObject[]): UpsertObject[] {
	return [...upserts].sort((left, right) => {
		const leftTurn = left.turnOrder ?? Number.MAX_SAFE_INTEGER;
		const rightTurn = right.turnOrder ?? Number.MAX_SAFE_INTEGER;
		if (leftTurn !== rightTurn) {
			return leftTurn - rightTurn;
		}
		const leftItem = left.itemOrder ?? Number.MAX_SAFE_INTEGER;
		const rightItem = right.itemOrder ?? Number.MAX_SAFE_INTEGER;
		if (leftItem !== rightItem) {
			return leftItem - rightItem;
		}
		return left.emittedAt.localeCompare(right.emittedAt);
	});
}

export class CanonicalHistoryStore {
	private readonly historyBySessionId: CanonicalHistoryIndex;

	constructor(private readonly store: JsonStore<CanonicalHistoryIndex>) {
		this.historyBySessionId = this.store.readSync();
	}

	getHistory(sessionId: string): UpsertObject[] {
		return sortUpserts(this.historyBySessionId[sessionId]?.upserts ?? []);
	}

	replaceHistory(
		sessionId: string,
		cliType: CliType,
		upserts: UpsertObject[],
	): UpsertObject[] {
		const finalUpserts: UpsertObject[] = [];
		for (const upsert of upserts) {
			finalUpserts.push(this.recordUpsert(cliType, sessionId, upsert));
		}
		return finalUpserts;
	}

	recordUpsert(
		cliType: CliType,
		sessionId: string,
		upsert: UpsertObject,
	): UpsertObject {
		const sessionHistory =
			this.historyBySessionId[sessionId] ??
			({
				sessionId,
				cliType,
				updatedAt: upsert.emittedAt,
				upserts: [],
			} satisfies SessionCanonicalHistory);
		const existingItem = sessionHistory.upserts.find(
			(candidate) => candidate.itemId === upsert.itemId,
		);
		const existingTurn = sessionHistory.upserts.find(
			(candidate) => candidate.turnId === upsert.turnId,
		);
		const maxItemOrder = sessionHistory.upserts.reduce(
			(max, candidate) => Math.max(max, candidate.itemOrder ?? 0),
			0,
		);
		const maxTurnOrder = sessionHistory.upserts.reduce(
			(max, candidate) => Math.max(max, candidate.turnOrder ?? 0),
			0,
		);
		const enriched = enrichCanonicalUpsert(
			{
				...upsert,
				sessionId,
				itemOrder: existingItem?.itemOrder ?? upsert.itemOrder,
				turnOrder:
					existingItem?.turnOrder ??
					existingTurn?.turnOrder ??
					upsert.turnOrder,
			},
			{
				itemOrder: existingItem?.itemOrder ?? maxItemOrder + 1,
				turnOrder:
					existingItem?.turnOrder ??
					existingTurn?.turnOrder ??
					maxTurnOrder + 1,
			},
		);

		const nextUpserts = sessionHistory.upserts.filter(
			(candidate) => candidate.itemId !== enriched.itemId,
		);
		nextUpserts.push(enriched);
		this.historyBySessionId[sessionId] = {
			sessionId,
			cliType,
			updatedAt: enriched.emittedAt,
			upserts: sortUpserts(nextUpserts),
		};
		this.store.writeSyncBlocking(this.historyBySessionId);
		return enriched;
	}
}
