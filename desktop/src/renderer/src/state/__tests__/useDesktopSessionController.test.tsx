/* @vitest-environment jsdom */
import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import type {
	ClientMessage,
	Project,
	ServerMessage,
	SessionSelection,
	UpsertObject,
} from "@renderer/lib/types";
import { STORAGE_KEYS } from "@renderer/state/session-list-state";
import { useDesktopSessionController } from "@renderer/state/useDesktopSessionController";
import { beforeEach, describe, expect, it, vi } from "vitest";

const wsStore = vi.hoisted(() => ({
	instances: [] as unknown[],
}));

vi.mock("@renderer/lib/ws-client", () => ({
	WsClient: class MockWsClient {
		sentMessages: ClientMessage[] = [];

		constructor(
			private readonly options: {
				onMessage: (message: ServerMessage) => void;
				onStateChange: (
					state: "connecting" | "connected" | "disconnected" | "reconnecting",
				) => void;
				onConnected: () => void;
				wsUrl: string;
			},
		) {
			wsStore.instances.push(this);
		}

		connect(): void {
			this.options.onStateChange("connecting");
		}

		send(message: ClientMessage): void {
			this.sentMessages.push(message);
		}

		dispose(): void {}

		emitConnected(): void {
			this.options.onStateChange("connected");
			this.options.onConnected();
		}

		emitState(
			state: "connecting" | "connected" | "disconnected" | "reconnecting",
		): void {
			this.options.onStateChange(state);
		}

		emitMessage(message: ServerMessage): void {
			this.options.onMessage(message);
		}
	},
}));

type ControllerValue = ReturnType<typeof useDesktopSessionController>;
type MockWsClientInstance = {
	sentMessages: ClientMessage[];
	emitConnected: () => void;
	emitState: (
		state: "connecting" | "connected" | "disconnected" | "reconnecting",
	) => void;
	emitMessage: (message: ServerMessage) => void;
};

function ControllerHarness(props: {
	onChange: (controller: ControllerValue) => void;
}) {
	const controller = useDesktopSessionController();

	useEffect(() => {
		props.onChange(controller);
	}, [controller, props]);

	return null;
}

function buildProject(id: string, name = id): Project {
	return {
		id,
		name,
		path: `/tmp/${name}`,
		addedAt: "2026-03-06T00:00:00.000Z",
	};
}

function buildHistoryEntry(sessionId: string): UpsertObject {
	return {
		type: "message",
		status: "complete",
		turnId: `turn-${sessionId}`,
		sessionId,
		itemId: `assistant-${sessionId}`,
		sourceTimestamp: "2026-03-06T00:00:00.000Z",
		emittedAt: "2026-03-06T00:00:00.000Z",
		content: `history-${sessionId}`,
		origin: "agent",
	};
}

function getMockWs(): MockWsClientInstance {
	const instance = wsStore.instances[0];
	if (!instance) {
		throw new Error("Expected websocket client instance");
	}
	return instance as MockWsClientInstance;
}

function requireController(
	controller: ControllerValue | null,
): ControllerValue {
	if (!controller) {
		throw new Error("Expected controller state");
	}
	return controller;
}

describe("useDesktopSessionController", () => {
	beforeEach(() => {
		wsStore.instances.length = 0;
		window.localStorage.clear();
		Object.defineProperty(window, "desktopApi", {
			configurable: true,
			value: {
				getBackendConfig: vi.fn(async () => ({
					port: 3001,
					httpUrl: "http://127.0.0.1:3001",
					wsUrl: "ws://127.0.0.1:3001/ws",
				})),
				pickProjectDirectory: vi.fn(async () => null),
				onSidecarStatus: vi.fn(() => () => undefined),
			},
		});
	});

	it("reopens the stored project/session pair on reconnect", async () => {
		const selection: SessionSelection = {
			sessionId: "claude-code:session-1",
			projectId: "project-1",
			availability: "available",
			source: "builder",
		};
		window.localStorage.setItem(
			STORAGE_KEYS.selectedSession,
			JSON.stringify(selection),
		);

		let latest: ControllerValue | null = null;
		render(
			<ControllerHarness
				onChange={(controller) => {
					latest = controller;
				}}
			/>,
		);

		await waitFor(() => expect(wsStore.instances).toHaveLength(1));

		const ws = getMockWs();
		act(() => {
			ws.emitConnected();
			ws.emitState("reconnecting");
			ws.emitConnected();
		});

		await waitFor(() =>
			expect(requireController(latest).socketState).toBe("connected"),
		);

		const openMessages = ws.sentMessages.filter(
			(message): message is Extract<ClientMessage, { type: "session:open" }> =>
				message.type === "session:open",
		);

		expect(openMessages).toEqual([
			{
				type: "session:open",
				sessionId: "claude-code:session-1",
				projectId: "project-1",
			},
			{
				type: "session:open",
				sessionId: "claude-code:session-1",
				projectId: "project-1",
			},
		]);
	});

	it("does not send session:open for unavailable selections", async () => {
		let latest: ControllerValue | null = null;
		render(
			<ControllerHarness
				onChange={(controller) => {
					latest = controller;
				}}
			/>,
		);

		await waitFor(() => expect(wsStore.instances).toHaveLength(1));
		const ws = getMockWs();

		act(() => {
			ws.emitConnected();
			ws.emitMessage({
				type: "project:list",
				projects: [buildProject("project-1", "alpha")],
			});
			ws.emitMessage({
				type: "session:list",
				projectId: "project-1",
				sessions: [
					{
						id: "claude-code:stale-1",
						projectId: "project-1",
						title: "Stale thread",
						lastActiveAt: "2026-03-06T00:00:00.000Z",
						cliType: "claude-code",
						source: "builder",
						availability: "stale",
						providerSessionId: "stale-1",
						warningReason:
							"Builder metadata exists, but the provider session file is missing.",
					},
				],
			});
			requireController(latest).selectSession({
				sessionId: "claude-code:stale-1",
				projectId: "project-1",
				availability: "stale",
				source: "builder",
				warningReason:
					"Builder metadata exists, but the provider session file is missing.",
			});
		});

		const openMessages = ws.sentMessages.filter(
			(message): message is Extract<ClientMessage, { type: "session:open" }> =>
				message.type === "session:open",
		);

		expect(
			openMessages.some(
				(message) => message.sessionId === "claude-code:stale-1",
			),
		).toBe(false);
		expect(requireController(latest).workspace?.status).toBe("unavailable");
	});

	it("keeps transcript state when the session list refreshes", async () => {
		let latest: ControllerValue | null = null;
		render(
			<ControllerHarness
				onChange={(controller) => {
					latest = controller;
				}}
			/>,
		);

		await waitFor(() => expect(wsStore.instances).toHaveLength(1));
		const ws = getMockWs();

		act(() => {
			ws.emitConnected();
			ws.emitMessage({
				type: "project:list",
				projects: [buildProject("project-1", "alpha")],
			});
			ws.emitMessage({
				type: "session:list",
				projectId: "project-1",
				sessions: [
					{
						id: "claude-code:session-1",
						projectId: "project-1",
						title: "First title",
						lastActiveAt: "2026-03-06T00:00:00.000Z",
						cliType: "claude-code",
						source: "builder",
						availability: "available",
						providerSessionId: "session-1",
					},
				],
			});
			requireController(latest).selectSession({
				sessionId: "claude-code:session-1",
				projectId: "project-1",
				availability: "available",
				source: "builder",
			});
			ws.emitMessage({
				type: "session:history",
				sessionId: "claude-code:session-1",
				entries: [buildHistoryEntry("claude-code:session-1")],
			});
			ws.emitMessage({
				type: "session:list",
				projectId: "project-1",
				sessions: [
					{
						id: "claude-code:session-1",
						projectId: "project-1",
						title: "Renamed title",
						lastActiveAt: "2026-03-06T00:05:00.000Z",
						cliType: "claude-code",
						source: "builder",
						availability: "available",
						providerSessionId: "session-1",
					},
				],
			});
		});

		await waitFor(() =>
			expect(
				requireController(latest).workspace?.renderState.turns.length,
			).toBeGreaterThan(0),
		);

		expect(requireController(latest).workspace?.title).toBe("Renamed title");
		expect(
			requireController(latest).workspace?.renderState.turns[0]?.blocks[0],
		).toMatchObject({
			type: "assistant-document",
			content: "history-claude-code:session-1",
		});
	});
});
