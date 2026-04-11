import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { join } from "node:path";
import { AgentManager } from "../../server/acp/agent-manager";
import { ClaudeAgentSdkAdapter } from "../../server/providers/claude/claude-agent-sdk-adapter";
import { PooledClaudeSdkProvider } from "../../server/providers/claude/pooled-claude-sdk-provider";
import type { Project } from "../../server/projects/project-types";
import { ProjectStore } from "../../server/projects/project-store";
import { createBuilderSessionServices } from "../../server/sessions/session-services";
import {
	SessionTitleOverrideStore,
	type SessionTitleOverrideIndex,
} from "../../server/sessions/session-title-overrides";
import type { SessionMeta } from "../../server/sessions/session-types";
import { JsonStore } from "../../server/store/json-store";
import {
	CanonicalHistoryStore,
	type CanonicalHistoryIndex,
} from "../../server/streaming/canonical-history-store";

const SESSIONS_FILE = join(homedir(), ".liminal-builder", "sessions.json");
const PROJECTS_FILE = join(homedir(), ".liminal-builder", "projects.json");
const UPSERTS_FILE = join(
	homedir(),
	".liminal-builder",
	"session-upserts.json",
);
const OVERRIDES_FILE = join(
	homedir(),
	".liminal-builder",
	"session-title-overrides.json",
);

const sessionId = process.argv[2];
const projectId = process.argv[3];

if (!sessionId) {
	console.error(
		"Usage: bun run tools/server/debug-open-session.ts <sessionId> [projectId]",
	);
	process.exit(1);
}

const sessionStore = new JsonStore<SessionMeta[]>(
	{ filePath: SESSIONS_FILE, writeDebounceMs: 0 },
	[],
);
const projectStore = new ProjectStore(
	new JsonStore<Project[]>({ filePath: PROJECTS_FILE, writeDebounceMs: 0 }, []),
);
const historyStore = new CanonicalHistoryStore(
	new JsonStore<CanonicalHistoryIndex>(
		{ filePath: UPSERTS_FILE, writeDebounceMs: 0 },
		{},
	),
);
const titleOverrideStore = new SessionTitleOverrideStore(
	new JsonStore<SessionTitleOverrideIndex>(
		{ filePath: OVERRIDES_FILE, writeDebounceMs: 0 },
		{},
	),
);
const provider = new PooledClaudeSdkProvider(
	{ sdk: new ClaudeAgentSdkAdapter() },
	{ poolSize: 1, warmOnInit: false, defaultProjectDir: process.cwd() },
);
const services = createBuilderSessionServices({
	store: sessionStore,
	agentManager: new AgentManager(new EventEmitter()),
	projectStore,
	claudeProvider: provider,
	canonicalHistoryStore: historyStore,
	titleOverrideStore,
});

try {
	const loaded = await services.open.openSession(sessionId, projectId);
	console.log("loaded_count", loaded.history.length);
	await provider.shutdown();
} catch (error) {
	console.error(
		"ERROR",
		error instanceof Error ? error.message : String(error),
	);
	await provider.shutdown().catch(() => undefined);
	process.exit(1);
}
