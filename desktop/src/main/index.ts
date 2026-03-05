import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  resolveDesktopPort,
  startSidecar,
  type SidecarHandle,
  type SidecarStatus,
} from "./sidecar";

type BackendConfig = {
  port: number;
  httpUrl: string;
  wsUrl: string;
};

let mainWindow: BrowserWindow | null = null;
let sidecarHandle: SidecarHandle | null = null;
let backendConfig: BackendConfig | null = null;
let latestSidecarStatus: SidecarStatus | null = null;
let quitting = false;

type DesktopSettings = {
  repoRoot?: string;
};

function getSettingsPath(): string {
  return resolve(app.getPath("userData"), "desktop-settings.json");
}

function readSettings(): DesktopSettings {
  const settingsPath = getSettingsPath();
  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const raw = readFileSync(settingsPath, "utf8");
    return JSON.parse(raw) as DesktopSettings;
  } catch {
    return {};
  }
}

function writeSettings(settings: DesktopSettings): void {
  const settingsPath = getSettingsPath();
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function isValidRepoRoot(candidate: string): boolean {
  return (
    existsSync(resolve(candidate, "server/index.ts")) &&
    existsSync(resolve(candidate, "desktop/package.json"))
  );
}

async function resolveRepoRootPath(): Promise<string> {
  const settings = readSettings();
  const defaultRepoRoot = resolve(__dirname, "../../..");
  const home = app.getPath("home");
  const candidateRoots = [
    process.env.LB_DESKTOP_REPO_ROOT,
    settings.repoRoot,
    defaultRepoRoot,
    resolve(home, "liminal/apps/liminal-builder"),
    resolve(home, "code/liminal-builder"),
    resolve(home, "src/liminal-builder"),
  ];

  for (const candidate of candidateRoots) {
    if (candidate && isValidRepoRoot(candidate)) {
      if (settings.repoRoot !== candidate) {
        writeSettings({ ...settings, repoRoot: candidate });
      }
      return candidate;
    }
  }

  const pickerResult = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Locate Liminal Builder Repository",
    buttonLabel: "Use Repository",
    message:
      "Choose the liminal-builder repository folder (must contain server/index.ts and desktop/package.json).",
  });

  if (pickerResult.canceled || pickerResult.filePaths.length === 0) {
    throw new Error(
      "Repository root not selected. Set LB_DESKTOP_REPO_ROOT or choose the liminal-builder folder.",
    );
  }

  const selectedPath = pickerResult.filePaths[0] ?? "";
  if (!isValidRepoRoot(selectedPath)) {
    throw new Error(
      "Selected folder is not a valid liminal-builder repository (missing server/index.ts or desktop/package.json).",
    );
  }

  writeSettings({ ...settings, repoRoot: selectedPath });
  return selectedPath;
}

function broadcastSidecarStatus(status: SidecarStatus): void {
  latestSidecarStatus = status;
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("desktop:sidecar-status", status);
}

function createMainWindow(): BrowserWindow {
  const preloadPath = resolve(__dirname, "../preload/index.js");
  const appIconPath = resolve(__dirname, "../../assets/icons/app-icon-512.png");
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#0b0f14",
    title: "Liminal Builder Desktop",
    icon: appIconPath,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    ...(isMac
      ? {
          trafficLightPosition: { x: 14, y: 14 },
        }
      : {}),
    ...(isWindows
      ? {
          titleBarOverlay: {
            color: "#0f1115",
            symbolColor: "#cfd5df",
            height: 44,
          },
        }
      : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env.DESKTOP_RENDERER_DEV_URL;
  if (devUrl) {
    void window.loadURL(devUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    const rendererHtmlPath = resolve(__dirname, "../renderer/index.html");
    void window.loadFile(rendererHtmlPath);
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("did-finish-load", () => {
    if (latestSidecarStatus) {
      window.webContents.send("desktop:sidecar-status", latestSidecarStatus);
    }
  });

  return window;
}

async function showFatalAndExit(message: string): Promise<void> {
  dialog.showErrorBox("Desktop startup failed", message);
  app.exit(1);
}

async function bootstrap(): Promise<void> {
  const port = resolveDesktopPort(process.env);

  try {
    const repoRoot = await resolveRepoRootPath();
    sidecarHandle = await startSidecar({
      repoRoot,
      port,
      onStatus: broadcastSidecarStatus,
    });

    backendConfig = {
      port: sidecarHandle.port,
      httpUrl: sidecarHandle.httpUrl,
      wsUrl: sidecarHandle.wsUrl,
    };

    sidecarHandle.process.once("exit", (code) => {
      if (quitting) {
        return;
      }
      broadcastSidecarStatus({
        level: "error",
        message: `Bun sidecar exited unexpectedly (code ${code ?? "unknown"})`,
        timestamp: Date.now(),
      });
    });
  } catch (error) {
    await showFatalAndExit(String(error));
    return;
  }

  mainWindow = createMainWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

void app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    const dockIconPath = resolve(__dirname, "../../assets/icons/app-icon-512.png");
    app.dock.setIcon(dockIconPath);
  }

  ipcMain.handle("desktop:get-backend-config", async () => {
    if (!backendConfig) {
      throw new Error("Backend config is not ready");
    }
    return backendConfig;
  });

  ipcMain.handle("desktop:pick-project-directory", async () => {
    const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const options: OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"],
      title: "Select a Project Directory",
      buttonLabel: "Use Project",
    };
    const result = targetWindow
      ? await dialog.showOpenDialog(targetWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });

  void bootstrap();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  quitting = true;
  if (!sidecarHandle) {
    return;
  }
  const handle = sidecarHandle;
  sidecarHandle = null;
  void handle.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
