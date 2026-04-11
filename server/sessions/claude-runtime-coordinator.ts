import { join } from "node:path";
import type { CliProvider } from "../providers/provider-types";
import type { TurnEvent, UpsertObject } from "../streaming/upsert-types";
import type {
	CanonicalHistoryStorePort,
	CanonicalStreamCallbacks,
	CliType,
	ProviderRuntimePort,
	SessionPromptResult,
} from "./session-types";

interface PendingClaudePrompt {
	callbacks: CanonicalStreamCallbacks;
	resolve: (result: SessionPromptResult) => void;
	reject: (error: Error) => void;
}

interface ClaudeSessionRuntime {
	providerSessionId: string;
	listenersAttached: boolean;
	pendingByTurnId: Map<string, PendingClaudePrompt>;
	bufferedUpsertsByTurnId: Map<string, UpsertObject[]>;
	bufferedTurnsByTurnId: Map<string, TurnEvent[]>;
}

const CLAUDE_LOAD_TIMEOUT_MS = 15_000;

export class ClaudeRuntimeCoordinator implements ProviderRuntimePort {
	private readonly claudeRuntimeByCanonicalId = new Map<
		string,
		ClaudeSessionRuntime
	>();
	private readonly claudeInitByCanonicalId = new Map<
		string,
		Promise<ClaudeSessionRuntime>
	>();

	constructor(
		private readonly provider?: CliProvider,
		private readonly canonicalHistoryStore?: CanonicalHistoryStorePort,
	) {}

	supports(cliType: CliType): boolean {
		return cliType === "claude-code" && Boolean(this.provider);
	}

	async createSession(options: {
		projectDir: string;
		providerOptions?: Record<string, unknown>;
	}) {
		return this.requireProvider().createSession(options);
	}

	async loadSession(
		canonicalId: string,
		providerSessionId: string,
		projectDir: string,
	): Promise<void> {
		await this.ensureClaudeSessionInitialized(
			canonicalId,
			providerSessionId,
			projectDir,
		);
	}

	async sendMessage(
		canonicalId: string,
		providerSessionId: string,
		message: string,
		callbacks: CanonicalStreamCallbacks,
	): Promise<SessionPromptResult> {
		const provider = this.requireProvider();
		const runtime = this.ensureClaudeRuntime(canonicalId, providerSessionId);
		const sendResult = await provider.sendMessage(providerSessionId, message);
		const { turnId } = sendResult;

		return await new Promise<SessionPromptResult>((resolve, reject) => {
			const pending: PendingClaudePrompt = {
				callbacks,
				resolve,
				reject,
			};
			runtime.pendingByTurnId.set(turnId, pending);
			this.flushBufferedClaudeEvents(runtime, turnId);
		});
	}

	async cancelTurn(providerSessionId: string): Promise<void> {
		await this.requireProvider().cancelTurn(providerSessionId);
	}

	private ensureClaudeRuntime(
		canonicalId: string,
		providerSessionId: string,
	): ClaudeSessionRuntime {
		const provider = this.requireProvider();
		const existing = this.claudeRuntimeByCanonicalId.get(canonicalId);
		const runtime: ClaudeSessionRuntime = existing ?? {
			providerSessionId,
			listenersAttached: false,
			pendingByTurnId: new Map<string, PendingClaudePrompt>(),
			bufferedUpsertsByTurnId: new Map<string, UpsertObject[]>(),
			bufferedTurnsByTurnId: new Map<string, TurnEvent[]>(),
		};
		runtime.providerSessionId = providerSessionId;
		this.claudeRuntimeByCanonicalId.set(canonicalId, runtime);

		if (!runtime.listenersAttached) {
			provider.onUpsert(providerSessionId, (upsert) => {
				this.handleClaudeUpsert(canonicalId, upsert);
			});
			provider.onTurn(providerSessionId, (event) => {
				this.handleClaudeTurn(canonicalId, event);
			});
			runtime.listenersAttached = true;
		}

		return runtime;
	}

	private ensureClaudeSessionInitialized(
		canonicalId: string,
		providerSessionId: string,
		projectDir: string,
	): Promise<ClaudeSessionRuntime> {
		const existingInit = this.claudeInitByCanonicalId.get(canonicalId);
		if (existingInit) {
			return existingInit;
		}

		const initPromise = (async () => {
			const provider = this.requireProvider();
			const viewFilePath = join(projectDir, ".liminal-builder-session-anchor");
			await this.withTimeout(
				provider.loadSession(providerSessionId, { viewFilePath }),
				CLAUDE_LOAD_TIMEOUT_MS,
				`Timed out loading Claude session ${providerSessionId}`,
			);
			return this.ensureClaudeRuntime(canonicalId, providerSessionId);
		})()
			.catch((error: unknown) => {
				const message =
					error instanceof Error
						? error.message
						: "Failed to load Claude session";
				throw new Error(message);
			})
			.finally(() => {
				this.claudeInitByCanonicalId.delete(canonicalId);
			});

		this.claudeInitByCanonicalId.set(canonicalId, initPromise);
		return initPromise;
	}

	private async withTimeout<T>(
		promise: Promise<T>,
		timeoutMs: number,
		errorMessage: string,
	): Promise<T> {
		let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutHandle = setTimeout(() => {
				reject(new Error(errorMessage));
			}, timeoutMs);
		});

		try {
			return await Promise.race([promise, timeoutPromise]);
		} finally {
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
		}
	}

	private flushBufferedClaudeEvents(
		runtime: ClaudeSessionRuntime,
		turnId: string,
	): void {
		const pending = runtime.pendingByTurnId.get(turnId);
		if (!pending) {
			return;
		}

		const bufferedUpserts = runtime.bufferedUpsertsByTurnId.get(turnId) ?? [];
		runtime.bufferedUpsertsByTurnId.delete(turnId);
		for (const upsert of bufferedUpserts) {
			pending.callbacks.onUpsert(upsert);
		}

		const bufferedTurns = runtime.bufferedTurnsByTurnId.get(turnId) ?? [];
		runtime.bufferedTurnsByTurnId.delete(turnId);
		for (const event of bufferedTurns) {
			pending.callbacks.onTurn(event);
			if (event.type === "turn_complete" || event.type === "turn_error") {
				this.resolveClaudeTurn(runtime, turnId, event);
			}
		}
	}

	private handleClaudeUpsert(canonicalId: string, upsert: UpsertObject): void {
		const runtime = this.claudeRuntimeByCanonicalId.get(canonicalId);
		if (!runtime) {
			return;
		}
		const enriched =
			this.canonicalHistoryStore?.recordUpsert(
				"claude-code",
				canonicalId,
				upsert,
			) ?? upsert;
		const pending = runtime.pendingByTurnId.get(upsert.turnId);
		if (pending) {
			pending.callbacks.onUpsert(enriched);
			return;
		}
		const buffered = runtime.bufferedUpsertsByTurnId.get(upsert.turnId) ?? [];
		buffered.push(enriched);
		runtime.bufferedUpsertsByTurnId.set(upsert.turnId, buffered);
	}

	private handleClaudeTurn(canonicalId: string, event: TurnEvent): void {
		const runtime = this.claudeRuntimeByCanonicalId.get(canonicalId);
		if (!runtime) {
			return;
		}
		const pending = runtime.pendingByTurnId.get(event.turnId);
		if (pending) {
			pending.callbacks.onTurn(event);
			if (event.type === "turn_complete" || event.type === "turn_error") {
				this.resolveClaudeTurn(runtime, event.turnId, event);
			}
			return;
		}
		const buffered = runtime.bufferedTurnsByTurnId.get(event.turnId) ?? [];
		buffered.push(event);
		runtime.bufferedTurnsByTurnId.set(event.turnId, buffered);
	}

	private resolveClaudeTurn(
		runtime: ClaudeSessionRuntime,
		turnId: string,
		event: Extract<TurnEvent, { type: "turn_complete" | "turn_error" }>,
	): void {
		const pending = runtime.pendingByTurnId.get(turnId);
		if (!pending) {
			return;
		}
		runtime.pendingByTurnId.delete(turnId);
		if (event.type === "turn_error") {
			pending.reject(new Error(event.errorMessage));
			return;
		}
		pending.resolve({
			stopReason: event.status === "cancelled" ? "cancelled" : "end_turn",
		});
	}

	private requireProvider(): CliProvider {
		if (!this.provider) {
			throw new Error("Claude provider is not configured");
		}
		return this.provider;
	}
}
