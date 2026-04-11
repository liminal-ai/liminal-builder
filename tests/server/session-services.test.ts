import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentManager } from "../../server/acp/agent-manager";
import { AcpClient } from "../../server/acp/acp-client";
import type { ProjectStore } from "../../server/projects/project-store";
import { ClaudeSessionMessageService } from "../../server/sessions/claude-session-message-service";
import { SessionCreateService } from "../../server/sessions/session-create-service";
import { SessionListingService } from "../../server/sessions/session-listing-service";
import { SessionOpenService } from "../../server/sessions/session-open-service";
import { SessionRegistry } from "../../server/sessions/session-registry";
import { SessionTitleService } from "../../server/sessions/session-title-service";
import {
	SessionTitleOverrideStore,
	type SessionTitleOverrideIndex,
} from "../../server/sessions/session-title-overrides";
import type {
	CliType,
	ProviderRuntimePort,
	SessionDiscoveryPort,
	SessionMeta,
	SessionOpenError,
} from "../../server/sessions/session-types";
import { JsonStore } from "../../server/store/json-store";
import {
	CanonicalHistoryStore,
	type CanonicalHistoryIndex,
} from "../../server/streaming/canonical-history-store";

const mockSessions: SessionMeta[] = [
	{
		id: "claude-code:session-1",
		projectId: "project-1",
		cliType: "claude-code",
		archived: false,
		source: "builder",
		providerSessionId: "session-1",
		title: "Fix auth bug",
		lastActiveAt: "2026-02-05T10:00:00Z",
		createdAt: "2026-02-05T09:00:00Z",
	},
	{
		id: "codex:session-3",
		projectId: "project-1",
		cliType: "codex",
		archived: false,
		source: "builder",
		providerSessionId: "session-3",
		title: "Refactor API",
		lastActiveAt: "2026-02-04T08:00:00Z",
		createdAt: "2026-02-04T07:00:00Z",
	},
];

function createStore(tempDir: string): JsonStore<SessionMeta[]> {
	return new JsonStore<SessionMeta[]>(
		{
			filePath: join(tempDir, "sessions.json"),
			writeDebounceMs: 0,
		},
		[],
	);
}

function createCanonicalHistoryStore(tempDir: string): CanonicalHistoryStore {
	return new CanonicalHistoryStore(
		new JsonStore<CanonicalHistoryIndex>(
			{
				filePath: join(tempDir, "session-upserts.json"),
				writeDebounceMs: 0,
			},
			{},
		),
	);
}

function createTitleOverrideStore(tempDir: string): SessionTitleOverrideStore {
	return new SessionTitleOverrideStore(
		new JsonStore<SessionTitleOverrideIndex>(
			{
				filePath: join(tempDir, "session-title-overrides.json"),
				writeDebounceMs: 0,
			},
			{},
		),
	);
}

function createProjectStoreMock(
	projects: Array<{ id: string; path: string }>,
): Pick<ProjectStore, "listProjects"> {
	return {
		listProjects: vi.fn(async () =>
			projects.map((project) => ({
				id: project.id,
				path: project.path,
				name: project.id,
				addedAt: "2026-02-01T00:00:00Z",
			})),
		),
	};
}

function createRuntimeMock(): {
	runtime: ProviderRuntimePort;
	createSession: ReturnType<
		typeof vi.fn<
			(options: { projectDir: string }) => Promise<{
				sessionId: string;
				cliType: CliType;
			}>
		>
	>;
	loadSession: ReturnType<
		typeof vi.fn<
			(
				canonicalId: string,
				providerSessionId: string,
				projectDir: string,
			) => Promise<void>
		>
	>;
	sendMessage: ReturnType<
		typeof vi.fn<
			(
				canonicalId: string,
				providerSessionId: string,
				message: string,
			) => Promise<{ stopReason: "end_turn"; titleUpdated?: string }>
		>
	>;
	cancelTurn: ReturnType<
		typeof vi.fn<(providerSessionId: string) => Promise<void>>
	>;
} {
	const createSession = vi.fn(async () => ({
		sessionId: "abc123",
		cliType: "claude-code" as const,
	}));
	const loadSession = vi.fn(async () => undefined);
	const sendMessage = vi.fn(async () => ({ stopReason: "end_turn" as const }));
	const cancelTurn = vi.fn(async () => undefined);
	return {
		runtime: {
			createSession,
			loadSession,
			sendMessage,
			cancelTurn,
			supports: (cliType: CliType) => cliType === "claude-code",
		},
		createSession,
		loadSession,
		sendMessage,
		cancelTurn,
	};
}

function createDiscoveryMock(
	overrides?: Partial<SessionDiscoveryPort>,
): SessionDiscoveryPort {
	return {
		listProjectSessions: async () => [],
		findProjectSession: async () => undefined,
		getAvailability: async () => "available",
		...overrides,
	};
}

function createAgentManagerMock(): {
	agentManager: Pick<AgentManager, "ensureAgent">;
	ensureAgent: ReturnType<
		typeof vi.fn<(cliType: CliType) => Promise<AcpClient>>
	>;
	sessionNew: ReturnType<
		typeof vi.fn<(params: { cwd: string }) => Promise<{ sessionId: string }>>
	>;
} {
	const sessionNew = vi.fn(async () => ({ sessionId: "codex-123" }));
	const client = Object.create(AcpClient.prototype) as AcpClient;
	client.sessionNew = sessionNew;
	const ensureAgent = vi.fn(async () => client);
	return {
		agentManager: {
			ensureAgent,
		},
		ensureAgent,
		sessionNew,
	};
}

describe("Builder session services", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "liminal-session-services-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("lists merged sessions with discovered precedence and title overrides", async () => {
		const store = createStore(tempDir);
		await store.writeSync(mockSessions);
		const registry = new SessionRegistry(store);
		const titleOverrideStore = createTitleOverrideStore(tempDir);
		await titleOverrideStore.setOverride("claude-code:session-1", {
			title: "Reviewed auth persistence",
			updatedAt: "2026-03-05T00:00:00Z",
			source: "codex-spark",
			confidence: 0.88,
		});
		const titleService = new SessionTitleService(titleOverrideStore);
		const projectStore = createProjectStoreMock([
			{ id: "project-1", path: "/tmp/project-1" },
		]);
		const listingService = new SessionListingService(
			registry,
			createDiscoveryMock({
				listProjectSessions: async () => [
					{
						id: "claude-code:session-1",
						providerSessionId: "session-1",
						title: "Discovered title",
						lastActiveAt: "2026-03-05T12:00:00.000Z",
						cliType: "claude-code",
					},
				],
			}),
			projectStore,
			titleService,
		);

		const listed = await listingService.listSessions("project-1");

		expect(listed).toHaveLength(2);
		expect(listed[0]).toMatchObject({
			id: "claude-code:session-1",
			title: "Reviewed auth persistence",
			availability: "available",
			lastActiveAt: "2026-03-05T12:00:00.000Z",
			projectId: "project-1",
			source: "builder",
		});
	});

	it("creates Claude sessions through the runtime and persists builder metadata", async () => {
		const store = createStore(tempDir);
		const registry = new SessionRegistry(store);
		const { runtime, createSession } = createRuntimeMock();
		const createService = new SessionCreateService(
			registry,
			createProjectStoreMock([{ id: "project-1", path: "/tmp/project-1" }]),
			createAgentManagerMock().agentManager,
			runtime,
		);

		const created = await createService.createSession(
			"project-1",
			"claude-code",
		);

		expect(createSession).toHaveBeenCalledWith({
			projectDir: "/tmp/project-1",
		});
		expect(created).toMatchObject({
			id: "claude-code:abc123",
			projectId: "project-1",
			cliType: "claude-code",
			source: "builder",
			providerSessionId: "abc123",
		});
		expect(registry.get("claude-code:abc123")).toBeDefined();
	});

	it("falls back to the compatibility agent when creating Codex sessions", async () => {
		const store = createStore(tempDir);
		const registry = new SessionRegistry(store);
		const runtime = {
			...createRuntimeMock().runtime,
			supports: () => false,
		} satisfies ProviderRuntimePort;
		const { agentManager, ensureAgent, sessionNew } = createAgentManagerMock();
		const createService = new SessionCreateService(
			registry,
			createProjectStoreMock([{ id: "project-1", path: "/tmp/project-1" }]),
			agentManager,
			runtime,
		);

		const created = await createService.createSession("project-1", "codex");

		expect(ensureAgent).toHaveBeenCalledWith("codex");
		expect(sessionNew).toHaveBeenCalledWith({ cwd: "/tmp/project-1" });
		expect(created.id).toBe("codex:codex-123");
	});

	it("adopts discovered Claude sessions and returns canonical persisted history", async () => {
		const store = createStore(tempDir);
		const registry = new SessionRegistry(store);
		const historyStore = createCanonicalHistoryStore(tempDir);
		historyStore.recordUpsert("claude-code", "claude-code:discovered-1", {
			type: "message",
			status: "complete",
			turnId: "turn-1",
			sessionId: "claude-code:discovered-1",
			itemId: "assistant-1",
			sourceTimestamp: "2026-02-06T09:00:01Z",
			emittedAt: "2026-02-06T09:00:01Z",
			content: "# Persisted answer",
			origin: "agent",
		});
		const { runtime, loadSession } = createRuntimeMock();
		const openService = new SessionOpenService(
			registry,
			createDiscoveryMock({
				findProjectSession: async () => ({
					id: "claude-code:discovered-1",
					providerSessionId: "discovered-1",
					title: "Imported session",
					lastActiveAt: "2026-02-06T09:00:01Z",
					cliType: "claude-code",
				}),
			}),
			createProjectStoreMock([{ id: "project-1", path: "/tmp/project-1" }]),
			runtime,
			historyStore,
		);

		const opened = await openService.openSession(
			"claude-code:discovered-1",
			"project-1",
		);

		expect(opened.source).toBe("adopted");
		expect(opened.history).toHaveLength(1);
		expect(registry.get("claude-code:discovered-1")).toMatchObject({
			source: "adopted",
			projectId: "project-1",
		});
		expect(loadSession).toHaveBeenCalledWith(
			"claude-code:discovered-1",
			"discovered-1",
			"/tmp/project-1",
		);
	});

	it("throws a stale-local error when provider history is missing and nothing is persisted", async () => {
		const store = createStore(tempDir);
		await store.writeSync([
			{
				id: "claude-code:stale-session",
				projectId: "project-1",
				cliType: "claude-code",
				archived: false,
				source: "builder",
				providerSessionId: "stale-session",
				title: "Stale Session",
				lastActiveAt: "2026-02-05T12:00:00Z",
				createdAt: "2026-02-05T12:00:00Z",
			},
		]);
		const openService = new SessionOpenService(
			new SessionRegistry(store),
			createDiscoveryMock({
				getAvailability: async () => "stale",
			}),
			createProjectStoreMock([{ id: "project-1", path: "/tmp/project-1" }]),
			createRuntimeMock().runtime,
		);

		await expect(
			openService.openSession("claude-code:stale-session", "project-1"),
		).rejects.toMatchObject({
			reason: "stale_local_session",
		} satisfies Partial<SessionOpenError>);
	});

	it("derives the initial title and updates activity during Claude sends", async () => {
		const store = createStore(tempDir);
		await store.writeSync([
			{
				id: "claude-code:abc123",
				projectId: "project-1",
				cliType: "claude-code",
				archived: false,
				source: "builder",
				providerSessionId: "abc123",
				title: "New Session",
				lastActiveAt: "2026-02-05T12:00:00Z",
				createdAt: "2026-02-05T12:00:00Z",
			},
		]);
		const registry = new SessionRegistry(store);
		const { runtime, loadSession, sendMessage } = createRuntimeMock();
		const messageService = new ClaudeSessionMessageService(
			registry,
			createProjectStoreMock([{ id: "project-1", path: "/tmp/project-1" }]),
			runtime,
			new SessionTitleService(),
		);

		const result = await messageService.sendMessage(
			"claude-code:abc123",
			"Investigate auth persistence",
			{
				onUpsert: () => undefined,
				onTurn: () => undefined,
			},
		);

		expect(loadSession).toHaveBeenCalledWith(
			"claude-code:abc123",
			"abc123",
			"/tmp/project-1",
		);
		expect(sendMessage).toHaveBeenCalledWith(
			"claude-code:abc123",
			"abc123",
			"Investigate auth persistence",
			expect.any(Object),
		);
		expect(result.titleUpdated).toBe("Investigate auth persistence");
		expect(registry.get("claude-code:abc123")?.title).toBe(
			"Investigate auth persistence",
		);
	});
});
