/**
 * Synapmsg WebSocket client.
 *
 * Singleton class. Connects to `ws://<API_HOST>/ws?token=JWT`.
 * Features:
 *   • Auto-reconnect with exponential backoff (1s → 2s → 4s → 8s → … → 30s cap)
 *   • Pluggable message + state listeners (returns unsubscribe fn)
 *   • `send(type, data)` for outbound frames
 *   • Idempotent `connect()` / `disconnect()`
 *
 * Uses the global `WebSocket` implementation shipped with React Native.
 */

import { buildWsUrl } from './client';
import type { WsClientMessage, WsServerMessage, WsConnectionState } from '../types';

type MessageListener = (msg: WsServerMessage) => void;
type StateListener = (state: WsConnectionState) => void;

const MAX_BACKOFF_MS = 30_000;
const BACKOFF_STEPS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

export class WebSocketManager {
  private socket: WebSocket | null = null;
  private token: string | null = null;

  private state: WsConnectionState = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private manuallyClosed = false;

  private messageListeners = new Set<MessageListener>();
  private stateListeners = new Set<StateListener>();

  // ───────────────────────────────────────────────────────
  // Singleton
  // ───────────────────────────────────────────────────────
  private static instance: WebSocketManager | null = null;

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  // ───────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────
  getState(): WsConnectionState {
    return this.state;
  }

  private setState(next: WsConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateListeners.forEach((cb) => {
      try {
        cb(next);
      } catch {
        /* swallow listener errors */
      }
    });
  }

  onStateChange(cb: StateListener): () => void {
    this.stateListeners.add(cb);
    // Push current state immediately so subscribers can render.
    cb(this.state);
    return () => this.stateListeners.delete(cb);
  }

  // ───────────────────────────────────────────────────────
  // Message listeners
  // ───────────────────────────────────────────────────────
  onMessage(cb: MessageListener): () => void {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  // ───────────────────────────────────────────────────────
  // Connection lifecycle
  // ───────────────────────────────────────────────────────
  connect(token: string): void {
    // Reuse only if same token AND already connected.
    if (
      this.token === token &&
      this.socket &&
      this.state === 'connected'
    ) {
      return;
    }
    // Switching tokens / half-open socket: tear down first.
    if (this.socket) {
      this.teardownSocket(false);
    }
    this.token = token;
    this.manuallyClosed = false;
    this.openSocket();
  }

  /** Wait until WS is connected (reconnect if needed). */
  async ensureConnected(
    token?: string | null,
    timeoutMs = 6000,
  ): Promise<boolean> {
    const t = token ?? this.token;
    if (!t) return false;
    if (this.state === 'connected' && this.socket) return true;
    this.reconnect(t);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.state === 'connected' && this.socket) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return this.state === 'connected' && Boolean(this.socket);
  }

  private openSocket(): void {
    if (!this.token || this.manuallyClosed) return;

    this.setState('connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(buildWsUrl(this.token));
    } catch (err) {
      // Invalid URL or platform issue — schedule a retry.
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState('connected');
      this.startPing();
    };

    socket.onmessage = (event: WebSocketMessageEvent) => {
      this.handleRawMessage(event.data);
    };

    socket.onclose = () => {
      this.stopPing();
      this.socket = null;
      this.setState('disconnected');
      if (!this.manuallyClosed) {
        this.scheduleReconnect();
      }
    };

    socket.onerror = () => {
      // The onclose handler will fire next; we let it drive reconnection.
      // Close immediately to short-circuit any half-open sockets.
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    };
  }

  private handleRawMessage(raw: string | ArrayBuffer | Blob): void {
    let parsed: WsServerMessage;
    try {
      const text = typeof raw === 'string' ? raw : raw.toString();
      parsed = JSON.parse(text) as WsServerMessage;
    } catch {
      return; // ignore malformed frames
    }
    this.messageListeners.forEach((cb) => {
      try {
        cb(parsed);
      } catch {
        /* swallow listener errors */
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.manuallyClosed) return;
    const delay =
      BACKOFF_STEPS[Math.min(this.reconnectAttempt, BACKOFF_STEPS.length - 1)] ??
      MAX_BACKOFF_MS;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private startPing(): void {
    this.stopPing();
    // Keep NAT / proxies from dropping idle sockets (calls need live WS).
    this.pingTimer = setInterval(() => {
      this.send('ping');
    }, 20_000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private teardownSocket(suppressReconnect: boolean): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      const s = this.socket;
      // Detach handlers so onclose doesn't fire side effects we don't want.
      s.onopen = null;
      s.onmessage = null;
      s.onclose = null;
      s.onerror = null;
      try {
        s.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
    if (suppressReconnect) {
      this.manuallyClosed = true;
    }
    this.setState('disconnected');
  }

  disconnect(): void {
    this.teardownSocket(true);
    this.token = null;
    this.reconnectAttempt = 0;
  }

  /** Force re-open (e.g. after switching direct ↔ tunnel base URL). */
  reconnect(token?: string): void {
    const next = token ?? this.token;
    if (!next) return;
    this.teardownSocket(false);
    this.manuallyClosed = false;
    this.token = next;
    this.reconnectAttempt = 0;
    this.openSocket();
  }

  // ───────────────────────────────────────────────────────
  // Sending
  // ───────────────────────────────────────────────────────
  send(type: WsClientMessage['type'], data?: Partial<WsClientMessage>): boolean {
    if (!this.socket || this.state !== 'connected') {
      return false;
    }
    const frame = JSON.stringify({ type, ...data });
    try {
      this.socket.send(frame);
      return true;
    } catch {
      return false;
    }
  }
}

/** Convenience accessor — most callers want the singleton. */
export const wsManager = WebSocketManager.getInstance();

export default wsManager;
