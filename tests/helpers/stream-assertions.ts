import { expect } from "vitest";
import {
	streamEventEnvelopeSchema,
	type StreamEventEnvelope,
	type UpsertObject,
} from "@server/streaming";

/** Validate that an event passes Zod schema parsing */
export function assertValidEnvelope(event: unknown): StreamEventEnvelope {
	const result = streamEventEnvelopeSchema.safeParse(event);
	if (!result.success) {
		throw new Error(
			`Invalid envelope: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
		);
	}
	return result.data;
}

/** Assert that Zod schema parsing fails for the given input */
export function assertInvalidEnvelope(event: unknown): void {
	const result = streamEventEnvelopeSchema.safeParse(event);
	expect(result.success).toBe(false);
}

/** Assert upsert object has expected shape */
export function assertUpsertShape(
	upsert: UpsertObject,
	expected: {
		type?: UpsertObject["type"];
		status?: UpsertObject["status"];
		itemId?: string;
		turnId?: string;
		sessionId?: string;
	},
): void {
	if (expected.type !== undefined) expect(upsert.type).toBe(expected.type);
	if (expected.status !== undefined)
		expect(upsert.status).toBe(expected.status);
	if (expected.itemId !== undefined)
		expect(upsert.itemId).toBe(expected.itemId);
	if (expected.turnId !== undefined)
		expect(upsert.turnId).toBe(expected.turnId);
	if (expected.sessionId !== undefined)
		expect(upsert.sessionId).toBe(expected.sessionId);
}

/** Assert all events in a sequence share the same turnId */
export function assertTurnCorrelation(
	events: StreamEventEnvelope[],
	expectedTurnId: string,
): void {
	for (const event of events) {
		expect(event.turnId).toBe(expectedTurnId);
	}
}

/**
 * Assert all item-scoped payloads in a sequence share the same itemId.
 * Non-item payloads (e.g. response_start/response_done/response_error) are ignored.
 */
export function assertItemIdConsistency(
	events: StreamEventEnvelope[],
	expectedItemId: string,
): void {
	for (const event of events) {
		const payload = event.payload;
		if ("itemId" in payload) {
			expect(payload.itemId).toBe(expectedItemId);
		}
	}
}

// Backward-compatible alias
export const assertItemCorrelation = assertItemIdConsistency;
