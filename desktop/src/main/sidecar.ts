import { spawn, type ChildProcessByStdio } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import { createServer } from "node:net";
import { delimiter, join } from "node:path";
import type { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_PORT = 3051;
const READY_TIMEOUT_MS = 20_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

type SidecarStatusLevel = "info" | "error";

export interface SidecarStatus {
  level: SidecarStatusLevel;
  message: string;
  timestamp: number;
}

export interface SidecarHandle {
  port: number;
  httpUrl: string;
  wsUrl: string;
  process: SidecarProcess;
  stop: () => Promise<void>;
}

export interface StartSidecarOptions {
  repoRoot: string;
  port: number;
  onStatus?: (status: SidecarStatus) => void;
}

type SidecarProcess = ChildProcessByStdio<null, Readable, Readable>;

function emitStatus(
  onStatus: StartSidecarOptions["onStatus"],
  level: SidecarStatusLevel,
  message: string,
): void {
  onStatus?.({ level, message, timestamp: Date.now() });
}

export function resolveDesktopPort(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const rawValue = env.LB_DESKTOP_SERVER_PORT;
  if (!rawValue) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return DEFAULT_PORT;
  }

  return parsed;
}

function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveBunExecutable(env: NodeJS.ProcessEnv = process.env): string {
  const binaryName = process.platform === "win32" ? "bun.exe" : "bun";
  const pathCandidates = (env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, binaryName));

  const home = env.HOME ?? env.USERPROFILE ?? "";
  const candidates = [
    env.LB_BUN_PATH,
    ...pathCandidates,
    home ? join(home, ".bun", "bin", binaryName) : undefined,
    process.platform === "darwin" ? `/opt/homebrew/bin/${binaryName}` : undefined,
    process.platform === "darwin" ? `/usr/local/bin/${binaryName}` : undefined,
  ];

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Unable to locate Bun executable. Install Bun and ensure it is on PATH, or set LB_BUN_PATH to an absolute Bun binary path.",
  );
}

export async function isPortAvailable(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

async function waitForServerReady(
  url: string,
  timeoutMs: number,
  isExited: () => boolean,
  getStartupError: () => Error | null,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const startupError = getStartupError();
    if (startupError) {
      throw startupError;
    }

    if (isExited()) {
      throw new Error("Sidecar process exited before becoming ready");
    }

    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok || response.status === 302) {
        return;
      }
    } catch {
      // Continue polling.
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for sidecar readiness at ${url}`);
}

async function stopChildProcess(
  child: SidecarProcess,
): Promise<void> {
  if (!child.pid || child.killed || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  await Promise.race([
    new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    }),
    (async () => {
      await delay(SHUTDOWN_TIMEOUT_MS);
      if (!child.killed && child.exitCode === null) {
        child.kill("SIGKILL");
      }
    })(),
  ]);
}

export async function startSidecar(
  options: StartSidecarOptions,
): Promise<SidecarHandle> {
  const { repoRoot, port, onStatus } = options;
  const available = await isPortAvailable(port);
  if (!available) {
    throw new Error(
      `Port ${port} is already in use. Set LB_DESKTOP_SERVER_PORT to an available port.`,
    );
  }

  const httpUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const bunExecutable = resolveBunExecutable(process.env);

  emitStatus(onStatus, "info", `Starting Bun sidecar on port ${port}...`);

  const child: SidecarProcess = spawn(bunExecutable, ["run", "server/index.ts"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      LB_DESKTOP_MODE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stderrLines: string[] = [];
  child.stderr.on("data", (chunk: Buffer) => {
    const message = chunk.toString("utf8");
    stderrLines.push(message.trim());
    if (stderrLines.length > 30) {
      stderrLines.shift();
    }
  });

  let exited = false;
  let startupError: Error | null = null;
  child.once("error", (error) => {
    startupError = error instanceof Error ? error : new Error(String(error));
    exited = true;
  });

  child.once("exit", () => {
    exited = true;
  });

  try {
    await waitForServerReady(
      httpUrl,
      READY_TIMEOUT_MS,
      () => exited,
      () => startupError,
    );
  } catch (error) {
    await stopChildProcess(child);
    const tail = stderrLines.filter(Boolean).slice(-5).join("\n");
    const detail = tail.length > 0 ? `\n\n${tail}` : "";
    throw new Error(`Failed to start Bun sidecar: ${String(error)}${detail}`);
  }

  emitStatus(onStatus, "info", `Sidecar ready at ${httpUrl}`);

  return {
    port,
    httpUrl,
    wsUrl,
    process: child,
    stop: async () => {
      emitStatus(onStatus, "info", "Stopping Bun sidecar...");
      await stopChildProcess(child);
      emitStatus(onStatus, "info", "Bun sidecar stopped");
    },
  };
}
