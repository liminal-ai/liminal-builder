import type { EventEmitter } from "node:events";
import { AppError } from "../errors";
import type { CliType } from "../sessions/session-types";
import { AcpClient } from "./acp-client";

export type AgentStatus =
	| "idle"
	| "starting"
	| "connected"
	| "disconnected"
	| "reconnecting";

export type AgentProcessStdin = unknown;

export type AgentProcessStdout = unknown;

export interface AgentProcess {
	stdin: AgentProcessStdin;
	stdout: AgentProcessStdout;
	stderr?: unknown;
	exited: Promise<number>;
	kill?: (signal?: number | NodeJS.Signals) => unknown;
	pid?: number;
}

export interface AgentState {
	status: AgentStatus;
	process: AgentProcess | null;
	client: AcpClient | null;
	reconnectAttempts: number;
	reconnectTimer: ReturnType<typeof setTimeout> | null;
}

export interface AgentManagerDeps {
	spawn: (cmd: string[], opts: Record<string, unknown>) => AgentProcess;
	createClient: (
		stdin: AgentProcessStdin,
		stdout: AgentProcessStdout,
	) => AcpClient;
}

const ACP_COMMANDS: Partial<
	Record<CliType, { cmd: string; args: string[]; displayName: string }>
> = {
	"claude-code": {
		cmd: "claude-code-acp",
		args: [],
		displayName: "Claude Code",
	},
	// codex runtime entry deferred to Story 6
};

const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 30000;
const SHUTDOWN_TIMEOUT_MS = 5000;
const FORCE_KILL_SIGNAL: NodeJS.Signals = "SIGKILL";

const DEFAULT_DEPS: AgentManagerDeps = {
	spawn: (cmd, opts) => Bun.spawn({ cmd, ...opts }),
	createClient: (stdin, stdout) =>
		new AcpClient(stdin as WritableStream, stdout as ReadableStream),
};

/**
 * Manages ACP agent process lifecycle for all CLI types.
 * One process per CLI type, spawned on demand, monitored for health.
 *
 * Covers: AC-5.1 (auto-start), AC-5.2 (status), AC-5.3 (shutdown),
 *         AC-5.5 (start failure)
 */
export class AgentManager {
	private readonly agents = new Map<CliType, AgentState>();
	private readonly deps: AgentManagerDeps;
	private readonly spawnInFlight = new Map<CliType, Promise<AcpClient>>();
	private shuttingDown = false;
	public readonly emitter: EventEmitter;

	constructor(emitter: EventEmitter, deps?: Partial<AgentManagerDeps>) {
		this.emitter = emitter;
		this.deps = { ...DEFAULT_DEPS, ...deps };

		this.agents.set("claude-code", {
			status: "idle",
			process: null,
			client: null,
			reconnectAttempts: 0,
			reconnectTimer: null,
		});
	}

	/** Get or spawn agent for CLI type. Emits status events. */
	async ensureAgent(cliType: CliType): Promise<AcpClient> {
		const state = this.getOrCreateState(cliType);

		if (state.status === "connected" && state.client) {
			return state.client;
		}

		const existingSpawn = this.spawnInFlight.get(cliType);
		if (existingSpawn) {
			return existingSpawn;
		}

		const spawnPromise = this.spawnAgent(cliType).finally(() => {
			if (this.spawnInFlight.get(cliType) === spawnPromise) {
				this.spawnInFlight.delete(cliType);
			}
		});

		this.spawnInFlight.set(cliType, spawnPromise);
		return spawnPromise;
	}

	/** Get current status for a CLI type */
	getStatus(cliType: CliType): AgentStatus {
		return this.agents.get(cliType)?.status ?? "idle";
	}

	/** User-initiated reconnect */
	async reconnect(cliType: CliType): Promise<void> {
		const state = this.getOrCreateState(cliType);

		if (state.status === "connected" && state.client) {
			return;
		}

		if (state.reconnectTimer) {
			clearTimeout(state.reconnectTimer);
			state.reconnectTimer = null;
		}

		state.reconnectAttempts = 0;
		state.status = "reconnecting";
		this.emitter.emit("agent:status", { cliType, status: "reconnecting" });

		const existingSpawn = this.spawnInFlight.get(cliType);
		if (existingSpawn) {
			await existingSpawn;
			return;
		}

		const spawnPromise = this.spawnAgent(cliType).finally(() => {
			if (this.spawnInFlight.get(cliType) === spawnPromise) {
				this.spawnInFlight.delete(cliType);
			}
		});

		this.spawnInFlight.set(cliType, spawnPromise);
		await spawnPromise;
	}

	/** Shutdown all agents gracefully */
	async shutdownAll(): Promise<void> {
		this.shuttingDown = true;

		const shutdownPromises: Promise<void>[] = [];

		for (const [cliType, state] of this.agents) {
			if (state.reconnectTimer) {
				clearTimeout(state.reconnectTimer);
				state.reconnectTimer = null;
			}

			if (state.client || state.process) {
				shutdownPromises.push(this.shutdownAgent(cliType, state));
				continue;
			}

			state.status = "idle";
			state.reconnectAttempts = 0;
		}

		await Promise.all(shutdownPromises);
	}

	private getOrCreateState(cliType: CliType): AgentState {
		const existing = this.agents.get(cliType);
		if (existing) {
			return existing;
		}

		const state: AgentState = {
			status: "idle",
			process: null,
			client: null,
			reconnectAttempts: 0,
			reconnectTimer: null,
		};
		this.agents.set(cliType, state);
		return state;
	}

	private isEnoentError(error: unknown): boolean {
		if (error instanceof Error) {
			const errorWithCode = error as Error & { code?: string };
			return (
				errorWithCode.code === "ENOENT" ||
				error.message.toUpperCase().includes("ENOENT")
			);
		}
		return false;
	}

	private async spawnAgent(cliType: CliType): Promise<AcpClient> {
		const state = this.getOrCreateState(cliType);
		const cmdConfig = ACP_COMMANDS[cliType];
		if (!cmdConfig) {
			throw new AppError(
				"UNSUPPORTED_CLI",
				`CLI type not yet supported in Story 2b: ${cliType}`,
			);
		}

		state.status = "starting";
		this.emitter.emit("agent:status", { cliType, status: "starting" });
		if (state.reconnectTimer) {
			clearTimeout(state.reconnectTimer);
			state.reconnectTimer = null;
		}

		let proc: AgentProcess;
		try {
			proc = this.deps.spawn([cmdConfig.cmd, ...cmdConfig.args], {
				stdin: "pipe",
				stdout: "pipe",
				stderr: "pipe",
			});
		} catch (error: unknown) {
			state.status = "disconnected";
			state.process = null;
			state.client = null;

			const message = this.isEnoentError(error)
				? `Could not start ${cmdConfig.displayName}. Check that it's installed.`
				: `Could not connect to ${cmdConfig.displayName}`;
			this.emitter.emit("error", { cliType, message });
			throw new Error(message);
		}

		const client = this.deps.createClient(proc.stdin, proc.stdout);
		client.onError(() => {
			if (this.shuttingDown || state.process !== proc) {
				return;
			}
			this.onProcessExit(cliType, 1);
		});

		try {
			await client.initialize();
		} catch (_error: unknown) {
			try {
				proc.kill?.();
			} catch {
				// best effort
			}

			state.status = "disconnected";
			state.process = null;
			state.client = null;
			const message = `Could not connect to ${cmdConfig.displayName}`;
			this.emitter.emit("error", { cliType, message });
			throw new Error(message);
		}

		state.status = "connected";
		state.process = proc;
		state.client = client;
		state.reconnectAttempts = 0;
		this.emitter.emit("agent:status", { cliType, status: "connected" });

		void proc.exited.then((code) => {
			if (this.shuttingDown || state.process !== proc) {
				return;
			}
			this.onProcessExit(cliType, code);
		});

		return client;
	}

	private onProcessExit(cliType: CliType, code: number): void {
		void code;
		const state = this.getOrCreateState(cliType);

		if (this.shuttingDown || state.status === "idle") {
			return;
		}
		if (
			state.status === "disconnected" &&
			state.process === null &&
			state.client === null
		) {
			return;
		}

		state.process = null;
		state.client = null;
		state.status = "disconnected";
		this.emitter.emit("agent:status", { cliType, status: "disconnected" });

		if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			return;
		}

		this.scheduleReconnect(cliType);
	}

	private scheduleReconnect(cliType: CliType): void {
		const state = this.getOrCreateState(cliType);
		if (this.shuttingDown) {
			return;
		}

		state.reconnectAttempts += 1;
		const delay = Math.min(
			1000 * 2 ** (state.reconnectAttempts - 1),
			MAX_BACKOFF_MS,
		);
		state.status = "reconnecting";
		this.emitter.emit("agent:status", { cliType, status: "reconnecting" });

		state.reconnectTimer = setTimeout(() => {
			state.reconnectTimer = null;
			if (this.shuttingDown) {
				return;
			}

			const existingSpawn = this.spawnInFlight.get(cliType);
			if (existingSpawn) {
				return;
			}

			const spawnPromise = this.spawnAgent(cliType);
			this.spawnInFlight.set(cliType, spawnPromise);

			void spawnPromise
				.catch(() => {
					if (this.shuttingDown) {
						return;
					}

					if (state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
						this.scheduleReconnect(cliType);
					} else {
						state.status = "disconnected";
						this.emitter.emit("agent:status", {
							cliType,
							status: "disconnected",
						});
					}
				})
				.finally(() => {
					if (this.spawnInFlight.get(cliType) === spawnPromise) {
						this.spawnInFlight.delete(cliType);
					}
				});
		}, delay);
	}

	private async shutdownAgent(
		cliType: CliType,
		state: AgentState,
	): Promise<void> {
		const proc = state.process;
		const client = state.client;

		try {
			await client?.close(SHUTDOWN_TIMEOUT_MS);
		} catch {
			// best effort; forced kill path below handles failures
		}

		try {
			(proc?.stdin as { close?: () => void } | undefined)?.close?.();
		} catch {
			// best effort
		}

		if (proc) {
			const exited = proc.exited.then(
				() => true,
				() => true,
			);
			const timedOut = await Promise.race([
				exited,
				new Promise<boolean>((resolve) =>
					setTimeout(() => resolve(false), SHUTDOWN_TIMEOUT_MS),
				),
			]);

			if (!timedOut) {
				try {
					proc.kill?.(FORCE_KILL_SIGNAL);
				} catch {
					// best effort
				}
			}
		}

		state.status = "idle";
		state.process = null;
		state.client = null;
		state.reconnectAttempts = 0;
		state.reconnectTimer = null;
		this.spawnInFlight.delete(cliType);
	}
}
