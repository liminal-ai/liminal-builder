import { contextBridge, ipcRenderer } from "electron";

export type BackendConfig = {
  port: number;
  httpUrl: string;
  wsUrl: string;
};

export type SidecarStatus = {
  level: "info" | "error";
  message: string;
  timestamp: number;
};

const api = {
  getBackendConfig: async (): Promise<BackendConfig> => {
    return await ipcRenderer.invoke("desktop:get-backend-config");
  },
  pickProjectDirectory: async (): Promise<string | null> => {
    return await ipcRenderer.invoke("desktop:pick-project-directory");
  },
  onSidecarStatus: (callback: (status: SidecarStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: SidecarStatus) => {
      callback(payload);
    };

    ipcRenderer.on("desktop:sidecar-status", handler);
    return () => {
      ipcRenderer.removeListener("desktop:sidecar-status", handler);
    };
  },
};

contextBridge.exposeInMainWorld("desktopApi", api);
