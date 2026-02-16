import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSessionRoutes } from "../../../server/api/session/routes";
import type {
	SessionService,
	SessionState,
} from "../../../server/api/session/session-service";
import { ProviderError } from "../../../server/providers/provider-errors";
import type { CliType } from "../../../server/providers/provider-types";

interface SessionServiceMocks {
	createSession: ReturnType<typeof vi.fn<SessionService["createSession"]>>;
	loadSession: ReturnType<typeof vi.fn<SessionService["loadSession"]>>;
	listSessions: ReturnType<typeof vi.fn<SessionService["listSessions"]>>;
	getStatus: ReturnType<typeof vi.fn<SessionService["getStatus"]>>;
	sendMessage: ReturnType<typeof vi.fn<SessionService["sendMessage"]>>;
	cancelTurn: ReturnType<typeof vi.fn<SessionService["cancelTurn"]>>;
	killSession: ReturnType<typeof vi.fn<SessionService["killSession"]>>;
}

function createSessionServiceMock(): {
	service: SessionService;
	mocks: SessionServiceMocks;
} {
	const createSession = vi
		.fn<SessionService["createSession"]>()
		.mockResolvedValue({ sessionId: "session-1", cliType: "claude-code" });
	const loadSession = vi
		.fn<SessionService["loadSession"]>()
		.mockResolvedValue({ sessionId: "session-1", cliType: "claude-code" });
	const listSessions = vi
		.fn<SessionService["listSessions"]>()
		.mockResolvedValue({
			sessions: [],
		});
	const getStatus = vi.fn<SessionService["getStatus"]>().mockResolvedValue({
		sessionId: "session-1",
		cliType: "claude-code",
		isAlive: true,
		state: "open",
	});
	const sendMessage = vi
		.fn<SessionService["sendMessage"]>()
		.mockResolvedValue({ turnId: "turn-1" });
	const cancelTurn = vi
		.fn<SessionService["cancelTurn"]>()
		.mockResolvedValue(undefined);
	const killSession = vi
		.fn<SessionService["killSession"]>()
		.mockResolvedValue(undefined);

	return {
		service: {
			createSession,
			loadSession,
			listSessions,
			getStatus,
			sendMessage,
			cancelTurn,
			killSession,
		},
		mocks: {
			createSession,
			loadSession,
			listSessions,
			getStatus,
			sendMessage,
			cancelTurn,
			killSession,
		},
	};
}

describe("Session API routes (Story 3, Red)", () => {
	let app: FastifyInstance | null = null;
	let service: SessionService;
	let mocks: SessionServiceMocks;

	beforeEach(async () => {
		app = Fastify();
		const mockBundle = createSessionServiceMock();
		service = mockBundle.service;
		mocks = mockBundle.mocks;
		await registerSessionRoutes(app, { sessionService: service });
		await app.ready();
	});

	afterEach(async () => {
		if (app !== null) {
			await app.close();
		}
		vi.restoreAllMocks();
	});

	it("TC-6.1a: create route returns 201 with { sessionId, cliType }", async () => {
		const response = await app?.inject({
			method: "POST",
			url: "/api/session/create",
			payload: { cliType: "claude-code", projectDir: "/tmp/project-1" },
		});

		expect(response?.statusCode).toBe(201);
		expect(response?.json()).toEqual({
			sessionId: "session-1",
			cliType: "claude-code",
		});
		expect(mocks.createSession).toHaveBeenCalledWith({
			cliType: "claude-code",
			projectDir: "/tmp/project-1",
		});
	});

	it("TC-6.1b: create with unsupported cli returns 400 with UNSUPPORTED_CLI_TYPE", async () => {
		mocks.createSession.mockRejectedValueOnce(
			new ProviderError("UNSUPPORTED_CLI_TYPE", "Unsupported cliType"),
		);

		const response = await app?.inject({
			method: "POST",
			url: "/api/session/create",
			payload: { cliType: "unknown-cli", projectDir: "/tmp/project-1" },
		});

		expect(response?.statusCode).toBe(400);
		expect(response?.json()).toMatchObject({ code: "UNSUPPORTED_CLI_TYPE" });
	});

	it("TC-6.1c: list route returns project-scoped sessions", async () => {
		const sessions: Array<{
			sessionId: string;
			cliType: CliType;
			projectId: string;
			status: SessionState;
		}> = [
			{
				sessionId: "session-1",
				cliType: "claude-code",
				projectId: "project-1",
				status: "open",
			},
		];
		mocks.listSessions.mockResolvedValueOnce({ sessions });

		const response = await app?.inject({
			method: "GET",
			url: "/api/session/list?projectId=project-1",
		});

		expect(response?.statusCode).toBe(200);
		expect(response?.json()).toEqual({ sessions });
		expect(mocks.listSessions).toHaveBeenCalledWith({ projectId: "project-1" });
	});

	it("TC-6.1d: list without projectId returns 400 with PROJECT_ID_REQUIRED", async () => {
		const response = await app?.inject({
			method: "GET",
			url: "/api/session/list",
		});

		expect(response?.statusCode).toBe(400);
		expect(response?.json()).toMatchObject({ code: "PROJECT_ID_REQUIRED" });
		expect(mocks.listSessions).not.toHaveBeenCalled();
	});

	it("TC-6.1e: load route calls service/provider load and returns session handle", async () => {
		mocks.loadSession.mockResolvedValueOnce({
			sessionId: "session-2",
			cliType: "codex",
		});

		const response = await app?.inject({
			method: "POST",
			url: "/api/session/session-2/load",
		});

		expect(response?.statusCode).toBe(200);
		expect(response?.json()).toEqual({
			sessionId: "session-2",
			cliType: "codex",
		});
		expect(mocks.loadSession).toHaveBeenCalledWith({ sessionId: "session-2" });
	});

	it("TC-6.1f: load missing session returns 404 with SESSION_NOT_FOUND", async () => {
		mocks.loadSession.mockRejectedValueOnce(
			new ProviderError("SESSION_NOT_FOUND", "Session not found"),
		);

		const response = await app?.inject({
			method: "POST",
			url: "/api/session/missing-session/load",
		});

		expect(response?.statusCode).toBe(404);
		expect(response?.json()).toMatchObject({ code: "SESSION_NOT_FOUND" });
	});

	it("TC-6.2a: send route calls provider path and returns turnId", async () => {
		mocks.sendMessage.mockResolvedValueOnce({ turnId: "turn-abc-123" });

		const response = await app?.inject({
			method: "POST",
			url: "/api/session/session-1/send",
			payload: { content: "hello from test" },
		});

		expect(response?.statusCode).toBe(202);
		expect(response?.json()).toEqual({ turnId: "turn-abc-123" });
		expect(mocks.sendMessage).toHaveBeenCalledWith({
			sessionId: "session-1",
			content: "hello from test",
		});
	});

	it("TC-6.2b: send missing session returns 404 with SESSION_NOT_FOUND", async () => {
		mocks.sendMessage.mockRejectedValueOnce(
			new ProviderError("SESSION_NOT_FOUND", "Session not found"),
		);

		const response = await app?.inject({
			method: "POST",
			url: "/api/session/missing/send",
			payload: { content: "test message" },
		});

		expect(response?.statusCode).toBe(404);
		expect(response?.json()).toMatchObject({ code: "SESSION_NOT_FOUND" });
	});

	it("TC-6.2c: cancel route calls provider cancel path", async () => {
		const response = await app?.inject({
			method: "POST",
			url: "/api/session/session-3/cancel",
		});

		expect(response?.statusCode).toBe(200);
		expect(mocks.cancelTurn).toHaveBeenCalledWith({ sessionId: "session-3" });
	});

	it("TC-6.2d: returned turnId equals provider sendMessage() result", async () => {
		const canonicalTurnId = "provider-turn-009";
		mocks.sendMessage.mockResolvedValueOnce({ turnId: canonicalTurnId });

		const response = await app?.inject({
			method: "POST",
			url: "/api/session/session-1/send",
			payload: { content: "verify canonical id" },
		});

		expect(response?.statusCode).toBe(202);
		expect(response?.json()).toEqual({ turnId: canonicalTurnId });
	});

	it("TC-6.3a: kill route calls provider kill and removes active session", async () => {
		let activeSessions: Array<{
			sessionId: string;
			cliType: CliType;
			projectId: string;
			status: SessionState;
		}> = [
			{
				sessionId: "session-1",
				cliType: "claude-code",
				projectId: "project-1",
				status: "open",
			},
		];
		mocks.listSessions.mockImplementation(async ({ projectId }) => ({
			sessions: activeSessions.filter(
				(session) => session.projectId === projectId,
			),
		}));
		mocks.killSession.mockImplementationOnce(async ({ sessionId }) => {
			activeSessions = activeSessions.filter(
				(session) => session.sessionId !== sessionId,
			);
		});

		const killResponse = await app?.inject({
			method: "POST",
			url: "/api/session/session-1/kill",
		});
		const listResponse = await app?.inject({
			method: "GET",
			url: "/api/session/list?projectId=project-1",
		});

		expect(killResponse?.statusCode).toBe(200);
		expect(mocks.killSession).toHaveBeenCalledWith({ sessionId: "session-1" });
		expect(listResponse?.statusCode).toBe(200);
		expect(listResponse?.json()).toEqual({ sessions: [] });
	});

	it("TC-6.3b: status route returns { isAlive, state } for session", async () => {
		mocks.getStatus.mockResolvedValueOnce({
			sessionId: "session-9",
			cliType: "codex",
			isAlive: false,
			state: "dead",
		});

		const response = await app?.inject({
			method: "GET",
			url: "/api/session/session-9/status",
		});

		expect(response?.statusCode).toBe(200);
		expect(response?.json()).toEqual({
			sessionId: "session-9",
			cliType: "codex",
			isAlive: false,
			state: "dead",
		});
		expect(mocks.getStatus).toHaveBeenCalledWith({ sessionId: "session-9" });
	});
});
