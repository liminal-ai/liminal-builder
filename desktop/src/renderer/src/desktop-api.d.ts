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

declare global {
	interface Window {
		desktopApi: {
			getBackendConfig(): Promise<BackendConfig>;
			pickProjectDirectory(): Promise<string | null>;
			onSidecarStatus(callback: (status: SidecarStatus) => void): () => void;
		};
	}
}
