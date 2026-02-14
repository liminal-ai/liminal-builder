import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentManager } from "../../server/acp/agent-manager";
import { AcpClient } from "../../server/acp/acp-client";
import { ProjectStore } from "../../server/projects/project-store";
import { SessionManager } from "../../server/sessions/session-manager";
import type { CliType, SessionMeta } from "../../server/sessions/session-types";
import { JsonStore } from "../../server/store/json-store";
import type { ChatEntry } from "../../shared/types";

const mockSessions: SessionMeta[] = [
	{
		id: "claude-code:session-1",
		projectId: "project-1",
		cliType: "claude-code",
		archived: false,
		title: "Fix auth bug",
		lastActiveAt: "2026-02-05T10:00:00Z",
		createdAt: "2026-02-05T09:00:00Z",
	},
	{
		id: "claude-code:session-2",
		projectId: "project-1",
		cliType: "claude-code",
		archived: false,
		title: "Add unit tests",
		lastActiveAt: "2026-02-05T12:00:00Z",
		createdAt: "2026-02-05T11:00:00Z",
	},
	{
		id: "codex:session-3",
		projectId: "project-1",
		cliType: "codex",
		archived: false,
		title: "Refactor API",
		lastActiveAt: "2026-02-04T08:00:00Z",
		createdAt: "2026-02-04T07:00:00Z",
	},
];

function createStore(tempDir: string): JsonStore<SessionMeta[]> {
	const filePath = join(tempDir, "sessions.json");
	return new JsonStore<SessionMeta[]>({ filePath, writeDebounceMs: 0 }, []);
}

function createAcpClientMock(): {
	client: AcpClient;
	sessionNew: ReturnType<
		typeof vi.fn<(params: { cwd: string }) => Promise<{ sessionId: string }>>
	>;
	sessionLoad: ReturnType<
		typeof vi.fn<(sessionId: string, cwd: string) => Promise<ChatEntry[]>>
	>;
} {
	const sessionNew = vi.fn<
		(params: { cwd: string }) => Promise<{ sessionId: string }>
	>(() => Promise.resolve({ sessionId: "abc123" }));
	const sessionLoad = vi.fn<
		(sessionId: string, cwd: string) => Promise<ChatEntry[]>
	>(() => Promise.resolve([]));

	const client = Object.create(AcpClient.prototype) as AcpClient;
	client.sessionNew = sessionNew;
	client.sessionLoad = sessionLoad;

	return { client, sessionNew, sessionLoad };
}

function createAgentManagerMock(client: AcpClient): {
	manager: AgentManager;
	ensureAgent: ReturnType<
		typeof vi.fn<(cliType: CliType) => Promise<AcpClient>>
	>;
} {
	const ensureAgent = vi.fn<(cliType: CliType) => Promise<AcpClient>>(() =>
		Promise.resolve(client),
	);

	const manager = Object.create(AgentManager.prototype) as AgentManager;
	manager.ensureAgent = ensureAgent;

	return { manager, ensureAgent };
}

function createProjectStoreMock(
	projects: Array<{ id: string; path: string }>,
): {
	store: ProjectStore;
	listProjects: ReturnType<
		typeof vi.fn<
			() => Promise<
				Array<{ id: string; path: string; name: string; addedAt: string }>
			>
		>
	>;
} {
	const listProjects = vi.fn<
		() => Promise<
			Array<{ id: string; path: string; name: string; addedAt: string }>
		>
	>(() =>
		Promise.resolve(
			projects.map((project) => ({
				id: project.id,
				path: project.path,
				name: project.id,
				addedAt: "2026-02-01T00:00:00Z",
			})),
		),
	);

	const store = Object.create(ProjectStore.prototype) as ProjectStore;
	store.listProjects = listProjects;

	return { store, listProjects };
}

describe("SessionManager", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "liminal-session-manager-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("TC-2.1a: local sessions listed with metadata", async () => {
		const sessionStore = createStore(tempDir);
		await sessionStore.writeSync(mockSessions);
		const { client } = createAcpClientMock();
		const { manager } = createAgentManagerMock(client);
		const { store: projectStore } = createProjectStoreMock([]);
		const sessionManager = new SessionManager(
			sessionStore,
			manager,
			projectStore,
		);

		const listed = sessionManager.listSessions("project-1");

		expect(listed).toHaveLength(3);
		expect(listed).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "claude-code:session-1",
					title: "Fix auth bug",
					lastActiveAt: "2026-02-05T10:00:00Z",
					cliType: "claude-code",
				}),
				expect.objectContaining({
					id: "claude-code:session-2",
					title: "Add unit tests",
					lastActiveAt: "2026-02-05T12:00:00Z",
					cliType: "claude-code",
				}),
				expect.objectContaining({
					id: "codex:session-3",
					title: "Refactor API",
					lastActiveAt: "2026-02-04T08:00:00Z",
					cliType: "codex",
				}),
			]),
		);
	});

	it("TC-2.1b: sessions sorted by lastActiveAt descending", async () => {
		const sessionStore = createStore(tempDir);
		await sessionStore.writeSync(mockSessions);
		const { client } = createAcpClientMock();
		const { manager } = createAgentManagerMock(client);
		const { store: projectStore } = createProjectStoreMock([]);
		const sessionManager = new SessionManager(
			sessionStore,
			manager,
			projectStore,
		);

		const listed = sessionManager.listSessions("project-1");

		expect(listed.map((session) => session.id)).toEqual([
			"claude-code:session-2",
			"claude-code:session-1",
			"codex:session-3",
		]);
	});

	it("TC-2.1c: project with no sessions returns empty list", async () => {
		const sessionStore = createStore(tempDir);
		await sessionStore.writeSync(mockSessions);
		const { client } = createAcpClientMock();
		const { manager } = createAgentManagerMock(client);
		const { store: projectStore } = createProjectStoreMock([]);
		const sessionManager = new SessionManager(
			sessionStore,
			manager,
			projectStore,
		);

		const listed = sessionManager.listSessions("project-2");

		expect(listed).toEqual([]);
	});

	it("TC-2.2a: create session records metadata locally", async () => {
		const sessionStore = createStore(tempDir);
		const { client, sessionNew } = createAcpClientMock();
		const { manager, ensureAgent } = createAgentManagerMock(client);
		const { store: projectStore } = createProjectStoreMock([
			{ id: "project-1", path: "/tmp/project-1" },
		]);
		const sessionManager = new SessionManager(
			sessionStore,
			manager,
			projectStore,
		);

		const sessionId = await sessionManager.createSession(
			"project-1",
			"claude-code",
		);
		const persisted = await sessionStore.read();

		expect(ensureAgent).toHaveBeenCalledWith("claude-code");
		expect(sessionNew).toHaveBeenCalledWith({ cwd: "/tmp/project-1" });
		expect(sessionId).toBe("claude-code:abc123");
		expect(persisted).toHaveLength(1);
		expect(persisted[0]).toMatchObject({
			id: "claude-code:abc123",
			projectId: "project-1",
			cliType: "claude-code",
			title: "New Session",
			archived: false,
		});
		expect(new Date(persisted[0]?.createdAt ?? "").toISOString()).toBe(
			persisted[0]?.createdAt,
		);
		expect(new Date(persisted[0]?.lastActiveAt ?? "").toISOString()).toBe(
			persisted[0]?.lastActiveAt,
		);
	});

	it("TC-2.2f: create session propagates ACP error", async () => {
		const sessionStore = createStore(tempDir);
		const { client, sessionNew } = createAcpClientMock();
		sessionNew.mockRejectedValue(new Error("ACP unavailable"));
		const { manager } = createAgentManagerMock(client);
		const { store: projectStore } = createProjectStoreMock([
			{ id: "project-1", path: "/tmp/project-1" },
		]);
		const sessionManager = new SessionManager(
			sessionStore,
			manager,
			projectStore,
		);

		await expect(
			sessionManager.createSession("project-1", "claude-code"),
		).rejects.toMatchObject({
			message: "ACP unavailable",
		});
	});

	it("TC-2.3a: open session returns history from ACP", async () => {
		const history: ChatEntry[] = [
			{
				entryId: "entry-1",
				type: "user",
				content: "Hello",
				timestamp: "2026-02-05T12:00:00Z",
			},
			{
				entryId: "entry-2",
				type: "assistant",
				content: "Hi there",
				timestamp: "2026-02-05T12:00:01Z",
			},
		];
		const sessionStore = createStore(tempDir);
		await sessionStore.writeSync([
			{
				id: "claude-code:abc123",
				projectId: "project-1",
				cliType: "claude-code",
				archived: false,
				title: "New Session",
				lastActiveAt: "2026-02-05T12:00:00Z",
				createdAt: "2026-02-05T12:00:00Z",
			},
		]);

		const { client, sessionLoad } = createAcpClientMock();
		sessionLoad.mockResolvedValue(history);
		const { manager, ensureAgent } = createAgentManagerMock(client);
		const { store: projectStore } = createProjectStoreMock([
			{ id: "project-1", path: "/tmp/project-1" },
		]);
		const sessionManager = new SessionManager(
			sessionStore,
			manager,
			projectStore,
		);

		const loaded = await sessionManager.openSession("claude-code:abc123");

		expect(ensureAgent).toHaveBeenCalledWith("claude-code");
		expect(sessionLoad).toHaveBeenCalledWith(
			"abc123",
			"/tmp/project-1",
			undefined,
		);
		expect(loaded).toEqual(history);
	});

	it("TC-2.4a: archive marks session as hidden from list", async () => {
		const sessionStore = createStore(tempDir);
		await sessionStore.writeSync(mockSessions);
		const { client } = createAcpClientMock();
		const { manager } = createAgentManagerMock(client);
		const { store: projectStore } = createProjectStoreMock([]);
		const sessionManager = new SessionManager(
			sessionStore,
			manager,
			projectStore,
		);

		sessionManager.archiveSession("claude-code:session-1");
		const listed = sessionManager.listSessions("project-1");
		const persisted = await sessionStore.read();
		const archived = persisted.find(
			(session) => session.id === "claude-code:session-1",
		);

		expect(archived?.archived).toBe(true);
		expect(listed.map((session) => session.id)).not.toContain(
			"claude-code:session-1",
		);
	});

	it("TC-2.4c: orphan sessions not in list (sessions without local metadata)", async () => {
		const sessionStore = createStore(tempDir);
		await sessionStore.writeSync([]);
		const { client } = createAcpClientMock();
		const { manager } = createAgentManagerMock(client);
		const { store: projectStore } = createProjectStoreMock([]);
		const sessionManager = new SessionManager(
			sessionStore,
			manager,
			projectStore,
		);

		const listed = sessionManager.listSessions("project-1");

		expect(listed).toEqual([]);
		expect(listed.map((session) => session.id)).not.toContain(
			"claude-code:orphan-only-in-acp",
		);
	});

	it("TC-2.5a: sessions survive restart (persistence)", async () => {
		const sessionStore = createStore(tempDir);
		const { client } = createAcpClientMock();
		const { manager } = createAgentManagerMock(client);
		const { store: projectStore } = createProjectStoreMock([
			{ id: "project-1", path: "/tmp/project-1" },
		]);
		const sessionManagerA = new SessionManager(
			sessionStore,
			manager,
			projectStore,
		);

		await sessionManagerA.createSession("project-1", "claude-code");
		await sessionManagerA.createSession("project-1", "codex");

		const sessionStoreAfterRestart = createStore(tempDir);
		const sessionManagerB = new SessionManager(
			sessionStoreAfterRestart,
			manager,
			projectStore,
		);

		const listed = sessionManagerB.listSessions("project-1");

		expect(listed).toHaveLength(2);
		expect(listed[0]?.id).toMatch(/^(claude-code|codex):/);
		expect(listed[1]?.id).toMatch(/^(claude-code|codex):/);
	});

	it("TC-2.5b: history loads from agent after restart", async () => {
		const history: ChatEntry[] = [
			{
				entryId: "entry-1",
				type: "user",
				content: "Resume this work",
				timestamp: "2026-02-06T09:00:00Z",
			},
			{
				entryId: "entry-2",
				type: "assistant",
				content: "Continuing now",
				timestamp: "2026-02-06T09:00:01Z",
			},
		];

		const sessionStore = createStore(tempDir);
		await sessionStore.writeSync([
			{
				id: "claude-code:persisted-session",
				projectId: "project-1",
				cliType: "claude-code",
				archived: false,
				title: "Persisted Session",
				lastActiveAt: "2026-02-06T09:00:01Z",
				createdAt: "2026-02-06T09:00:00Z",
			},
		]);

		const { client, sessionLoad } = createAcpClientMock();
		sessionLoad.mockResolvedValue(history);
		const { manager, ensureAgent } = createAgentManagerMock(client);
		const { store: projectStore } = createProjectStoreMock([
			{ id: "project-1", path: "/tmp/project-1" },
		]);
		const sessionManager = new SessionManager(
			sessionStore,
			manager,
			projectStore,
		);

		const loaded = await sessionManager.openSession(
			"claude-code:persisted-session",
		);

		expect(ensureAgent).toHaveBeenCalledWith("claude-code");
		expect(sessionLoad).toHaveBeenCalledWith(
			"persisted-session",
			"/tmp/project-1",
			undefined,
		);
		expect(loaded).toEqual(history);
	});
});
