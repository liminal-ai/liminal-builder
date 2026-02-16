import { NotImplementedError } from "../errors";
import type { StreamEventEnvelope } from "./stream-event-schema";
import {
	DEFAULT_BATCH_GRADIENT,
	DEFAULT_BATCH_TIMEOUT_MS,
	type UpsertProcessorConfig,
	type UpsertProcessorDeps,
} from "./upsert-types";

export type UpsertStreamProcessorOptions = Partial<UpsertProcessorConfig>;

export interface UpsertProcessor {
	process(event: StreamEventEnvelope): void;
	destroy(reason?: { code: string; message: string }): void;
}

/**
 * Story 2 (Red) skeleton.
 * Behavior is intentionally unimplemented and covered by failing tests.
 */
export class UpsertStreamProcessor implements UpsertProcessor {
	private readonly config: UpsertProcessorConfig;

	constructor(
		private readonly deps: UpsertProcessorDeps,
		options: UpsertStreamProcessorOptions = {},
	) {
		this.config = {
			batchGradientTokens:
				options.batchGradientTokens ?? DEFAULT_BATCH_GRADIENT,
			batchTimeoutMs: options.batchTimeoutMs ?? DEFAULT_BATCH_TIMEOUT_MS,
		};
	}

	process(_event: StreamEventEnvelope): void {
		void this.deps;
		void this.config;
		throw new NotImplementedError("UpsertStreamProcessor.process");
	}

	destroy(_reason?: { code: string; message: string }): void {
		void this.deps;
		void this.config;
		throw new NotImplementedError("UpsertStreamProcessor.destroy");
	}
}
