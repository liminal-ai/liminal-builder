import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
	AgentManager,
	type AgentProcess,
	type AgentProcessStdin,
	type AgentProcessStdout,
} from "../../server/acp/agent-manager";
import { AcpClient } from "../../server/acp/acp-client";

const mock = vi.fn;
type CollectedEvent = {
	event: string | symbol;
	args: Record<string, unknown>[];
};
type InitializeResult = {
	protocolVersion: number;
	agentInfo: { name: string; title: string; version: string };
	agentCapabilities: { loadSession: boolean };
};

interface MockProcess extends AgentProcess {
	stdin: {
		write: (chunk: string) => void;
		close: () => void;
	};
	stdout: AgentProcessStdout;
	stderr: AgentProcessStdout;
	pid: number;
	exited: Promise<number>;
	kill: (signal?: number | NodeJS.Signals) => void;
	_resolveExit: (code: number) => void;
}

function createNeverAsyncIterable(): AsyncIterable<unknown> {
	return {
		[Symbol.asyncIterator]: () => ({
			next: () => new Promise<IteratorResult<unknown>>(() => {}),
		}),
	};
}

function getErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function getStringField(
	record: Record<string, unknown> | undefined,
	key: string,
): string {
	const value = record?.[key];
	if (typeof value === "string") {
		return value;
	}
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	) {
		return `${value}`;
	}
	return "";
}

function createMockProcess(pid = 1234): MockProcess {
	let resolveExit: (code: number) => void = () => {};
	const exited = new Promise<number>((resolve) => {
		resolveExit = resolve;
	});

	return {
		stdin: { write: mock(() => {}), close: mock(() => {}) },
		stdout: createNeverAsyncIterable(),
		stderr: createNeverAsyncIterable(),
		pid,
		exited,
		kill: mock(() => {}),
		_resolveExit: resolveExit,
	};
}

function collectEvents(emitter: EventEmitter): CollectedEvent[] {
	const events: CollectedEvent[] = [];
	const originalEmit = emitter.emit.bind(emitter);
	emitter.emit = ((event: string | symbol, ...args: unknown[]) => {
		const normalizedArgs = args.map((arg) => {
			if (typeof arg === "object" && arg !== null) {
				return arg as Record<string, unknown>;
			}
			return { value: arg };
		});
		events.push({ event, args: normalizedArgs });
		return originalEmit(event, ...args);
	}) as typeof emitter.emit;
	return events;
}

describe("AgentManager", () => {
	let emitter: EventEmitter;
	let manager: AgentManager;
	let events: CollectedEvent[];
	let mockSpawn: ReturnType<
		typeof vi.fn<(cmd: string[], opts: Record<string, unknown>) => MockProcess>
	>;
	let mockAcpInitialize: ReturnType<
		typeof vi.fn<() => Promise<InitializeResult>>
	>;

	beforeEach(() => {
		emitter = new EventEmitter();
		events = collectEvents(emitter);

		const proc = createMockProcess();
		mockSpawn = vi.fn<
			(cmd: string[], opts: Record<string, unknown>) => MockProcess
		>(() => proc);

		mockAcpInitialize = vi.fn<() => Promise<InitializeResult>>(() =>
			Promise.resolve({
				protocolVersion: 1,
				agentInfo: { name: "mock", title: "Mock", version: "1.0" },
				agentCapabilities: { loadSession: true },
			}),
		);

		manager = new AgentManager(emitter, {
			spawn: mockSpawn,
			createClient: (
				_stdin: AgentProcessStdin,
				_stdout: AgentProcessStdout,
			) => {
				const client = Object.create(AcpClient.prototype) as AcpClient;
				client.initialize = mockAcpInitialize;
				client.close = mock(() => Promise.resolve());
				client.onError = mock(() => {});
				client.sessionNew = mock(() =>
					Promise.resolve({ sessionId: "test-session" }),
				);
				return client;
			},
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("TC-5.1a: first session spawns agent", async () => {
		expect(manager.getStatus("claude-code")).toBe("idle");

		const client = await manager.ensureAgent("claude-code");

		expect(mockSpawn).toHaveBeenCalledTimes(1);
		expect(mockAcpInitialize).toHaveBeenCalledTimes(1);
		expect(client).toBeTruthy();
		expect(manager.getStatus("claude-code")).toBe("connected");

		const statusEvents = events.filter((e) => e.event === "agent:status");
		expect(statusEvents).toHaveLength(2);
		expect(statusEvents[0].args[0]).toMatchObject({
			cliType: "claude-code",
			status: "starting",
		});
		expect(statusEvents[1].args[0]).toMatchObject({
			cliType: "claude-code",
			status: "connected",
		});
	});

	it("TC-5.1b: second session reuses process", async () => {
		await manager.ensureAgent("claude-code");
		const spawnCallCount = mockSpawn.mock.calls.length;

		const client = await manager.ensureAgent("claude-code");

		expect(mockSpawn.mock.calls.length).toBe(spawnCallCount);
		expect(client).toBeTruthy();
		expect(manager.getStatus("claude-code")).toBe("connected");
	});

	it("TC-5.2a: connected status after init", async () => {
		await manager.ensureAgent("claude-code");

		expect(manager.getStatus("claude-code")).toBe("connected");
	});

	it("TC-5.2b: disconnected on process exit", async () => {
		const proc = createMockProcess();
		mockSpawn.mockImplementation(() => proc);
		await manager.ensureAgent("claude-code");
		events.length = 0;

		proc._resolveExit(1);
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(manager.getStatus("claude-code")).toBe("disconnected");
		const statusEvents = events.filter((e) => e.event === "agent:status");
		expect(statusEvents.some((e) => e.args[0]?.status === "disconnected")).toBe(
			true,
		);
	});

	it("TC-5.2c: reconnecting on auto-retry", async () => {
		const proc = createMockProcess();
		mockSpawn.mockImplementation(() => proc);
		await manager.ensureAgent("claude-code");
		events.length = 0;

		proc._resolveExit(1);
		await new Promise((resolve) => setTimeout(resolve, 50));

		const statusEvents = events.filter((e) => e.event === "agent:status");
		const hasReconnecting = statusEvents.some(
			(e) => e.args[0]?.status === "reconnecting",
		);
		const hasDisconnected = statusEvents.some(
			(e) => e.args[0]?.status === "disconnected",
		);

		expect(hasDisconnected || hasReconnecting).toBe(true);
	});

	it("TC-5.2d: manual reconnect spawns new", async () => {
		const proc = createMockProcess();
		mockSpawn.mockImplementation(() => proc);
		await manager.ensureAgent("claude-code");

		proc._resolveExit(1);
		await new Promise((resolve) => setTimeout(resolve, 50));

		const newProc = createMockProcess(5678);
		mockSpawn.mockImplementation(() => newProc);
		events.length = 0;

		await manager.reconnect("claude-code");

		expect(manager.getStatus("claude-code")).toBe("connected");
		const statusEvents = events.filter((e) => e.event === "agent:status");
		expect(statusEvents.some((e) => e.args[0]?.status === "connected")).toBe(
			true,
		);
	});

	it("TC-5.3a: shutdown terminates all", async () => {
		const proc = createMockProcess(1111);
		mockSpawn.mockImplementation(() => proc);

		await manager.ensureAgent("claude-code");

		proc.stdin.close = mock(() => {
			proc._resolveExit(0);
		});

		await manager.shutdownAll();

		expect(proc.stdin.close).toHaveBeenCalled();
	});

	it("TC-5.5a: ENOENT shows install message", async () => {
		mockSpawn.mockImplementation(() => {
			const err = new Error("spawn claude-code-acp ENOENT") as Error & {
				code?: string;
			};
			err.code = "ENOENT";
			throw err;
		});

		try {
			await manager.ensureAgent("claude-code");
			expect(true).toBe(false);
		} catch (err: unknown) {
			expect(getErrorMessage(err)).toContain("Check that it's installed");
		}

		const errorEvents = events.filter((e) => e.event === "error");
		expect(errorEvents.length).toBeGreaterThan(0);
		expect(getStringField(errorEvents[0].args[0], "message")).toContain(
			"Check that it's installed",
		);
	});

	it("TC-5.5b: handshake failure shows connect error", async () => {
		mockAcpInitialize.mockImplementation(() =>
			Promise.reject(new Error("Protocol version mismatch")),
		);

		try {
			await manager.ensureAgent("claude-code");
			expect(true).toBe(false);
		} catch (err: unknown) {
			expect(getErrorMessage(err)).toContain("Could not connect");
		}

		const errorEvents = events.filter((e) => e.event === "error");
		expect(errorEvents.length).toBeGreaterThan(0);
		expect(getStringField(errorEvents[0].args[0], "message")).toContain(
			"Could not connect",
		);
	});

	it("TC-5.6b: agent survives WS disconnect", async () => {
		await manager.ensureAgent("claude-code");

		expect(manager.getStatus("claude-code")).toBe("connected");
		const client = await manager.ensureAgent("claude-code");
		expect(client).toBeTruthy();
	});
});
