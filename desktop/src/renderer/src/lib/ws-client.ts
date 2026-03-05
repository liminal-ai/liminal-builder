import type { ClientMessage, ServerMessage, WsConnectionState } from "./types";

export interface WsClientOptions {
  wsUrl: string;
  onMessage: (message: ServerMessage) => void;
  onStateChange: (state: WsConnectionState["socketState"]) => void;
  onConnected: () => void;
}

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;
const RECONNECT_JITTER_MIN = 0.8;
const RECONNECT_JITTER_MAX = 1.2;

export class WsClient {
  private readonly options: WsClientOptions;
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private disposed = false;
  private queue: ClientMessage[] = [];

  constructor(options: WsClientOptions) {
    this.options = options;
  }

  connect(): void {
    if (this.disposed) {
      return;
    }

    const state = this.reconnectAttempt === 0 ? "connecting" : "reconnecting";
    this.options.onStateChange(state);

    this.ws = new WebSocket(this.options.wsUrl);

    this.ws.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.options.onStateChange("connected");
      this.flushQueue();
      this.options.onConnected();
    });

    this.ws.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as ServerMessage;
        this.options.onMessage(parsed);
      } catch {
        // Ignore malformed messages.
      }
    });

    this.ws.addEventListener("close", () => {
      this.options.onStateChange("disconnected");
      this.scheduleReconnect();
    });

    this.ws.addEventListener("error", () => {
      this.options.onStateChange("disconnected");
    });
  }

  send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return;
    }
    this.queue.push(message);
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private flushQueue(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    while (this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) {
        continue;
      }
      this.ws.send(JSON.stringify(next));
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== null) {
      return;
    }

    const baseDelay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    const jitter = RECONNECT_JITTER_MIN + Math.random() * (RECONNECT_JITTER_MAX - RECONNECT_JITTER_MIN);
    const delayMs = Math.min(Math.round(baseDelay * jitter), RECONNECT_MAX_MS);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempt += 1;
      this.connect();
    }, delayMs);
  }
}
