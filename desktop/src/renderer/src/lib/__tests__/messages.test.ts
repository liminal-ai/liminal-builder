import { describe, expect, it } from "vitest";
import { buildCreateSessionMessage, buildReconnectMessage } from "../messages";

describe("message builders", () => {
	it("creates claude-only session:create message", () => {
		expect(buildCreateSessionMessage("project-1")).toEqual({
			type: "session:create",
			projectId: "project-1",
			cliType: "claude-code",
		});
	});

	it("creates claude reconnect message", () => {
		expect(buildReconnectMessage()).toEqual({
			type: "session:reconnect",
			cliType: "claude-code",
		});
	});
});
