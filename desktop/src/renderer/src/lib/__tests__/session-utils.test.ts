import { describe, expect, it } from "vitest";
import { filterClaudeSessions } from "../session-utils";

describe("filterClaudeSessions", () => {
  it("filters codex sessions from sidebar lists", () => {
    const result = filterClaudeSessions([
      {
        id: "claude-code:1",
        title: "Claude",
        lastActiveAt: new Date().toISOString(),
        cliType: "claude-code",
      },
      {
        id: "codex:2",
        title: "Codex",
        lastActiveAt: new Date().toISOString(),
        cliType: "codex",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("claude-code:1");
  });
});
