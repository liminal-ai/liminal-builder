import { NotImplementedError } from "../errors";
import type { CliType } from "../sessions/session-types";
import { AcpClient } from "./acp-client";
import type { EventEmitter } from "node:events";

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
}

export interface AgentManagerDeps {
	spawn: (cmd: string[], opts: Record<string, unknown>) => AgentProcess;
	createClient: (
		stdin: AgentProcessStdin,
		stdout: AgentProcessStdout,
	) => AcpClient;
}

/**
 * Manages ACP agent process lifecycle for all CLI types.
 * One process per CLI type, spawned on demand, monitored for health.
 *
 * Covers: AC-5.1 (auto-start), AC-5.2 (status), AC-5.3 (shutdown),
 *         AC-5.5 (start failure)
 */
export class AgentManager {
	private readonly agents = new Map<CliType, AgentState>();
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: used by Green implementation
	private readonly deps: AgentManagerDeps;
	public readonly emitter: EventEmitter;

	constructor(emitter: EventEmitter, deps?: Partial<AgentManagerDeps>) {
		this.emitter = emitter;
		this.deps = {
			spawn: (cmd, opts) => Bun.spawn({ cmd, ...opts }),
			createClient: (stdin, stdout) =>
				new AcpClient(stdin as WritableStream, stdout as ReadableStream),
			...deps,
		};

		this.agents.set("claude-code", {
			status: "idle",
			process: null,
			client: null,
			reconnectAttempts: 0,
		});
	}

	/** Get or spawn agent for CLI type. Emits status events. */
	async ensureAgent(_cliType: CliType): Promise<AcpClient> {
		throw new NotImplementedError("AgentManager.ensureAgent");
	}

	/** Get current status for a CLI type */
	getStatus(_cliType: CliType): AgentStatus {
		throw new NotImplementedError("AgentManager.getStatus");
	}

	/** User-initiated reconnect */
	async reconnect(_cliType: CliType): Promise<void> {
		throw new NotImplementedError("AgentManager.reconnect");
	}

	/** Shutdown all agents gracefully */
	async shutdownAll(): Promise<void> {
		throw new NotImplementedError("AgentManager.shutdownAll");
	}
}
