import WebSocket from "ws";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maskEndpoint } from "./config.js";
import { XiaozhiWebSocketTransport } from "./xiaozhi-transport.js";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface BridgeOptions {
  /** URL lengkap wss://api.xiaozhi.me/mcp/?token=... dari Xiaozhi Console. */
  endpoint: string;
  createServer: () => McpServer;
  logger?: Logger;
  signal?: AbortSignal;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  pingIntervalMs?: number;
}

const consoleLogger: Logger = {
  info: (m) => console.log(`[bridge] ${m}`),
  warn: (m) => console.warn(`[bridge] ${m}`),
  error: (m) => console.error(`[bridge] ${m}`),
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

function openSocket(endpoint: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    const onError = (err: Error) => {
      ws.removeAllListeners();
      reject(err);
    };
    ws.once("error", onError);
    ws.once("open", () => {
      ws.removeListener("error", onError);
      resolve(ws);
    });
  });
}

/**
 * Menjaga koneksi keluar ke endpoint MCP Xiaozhi. Xiaozhi bertindak sebagai MCP client;
 * setiap koneksi baru mendapat instance McpServer baru. Berjalan sampai signal di-abort.
 * Harus dijalankan di proses panjang (VPS, Railway, Render, Fly, dsb.) — bukan serverless.
 */
export async function runBridge(options: BridgeOptions): Promise<void> {
  const {
    endpoint,
    createServer,
    logger = consoleLogger,
    signal,
    initialBackoffMs = 1000,
    maxBackoffMs = 60_000,
    pingIntervalMs = 30_000,
  } = options;
  const masked = maskEndpoint(endpoint);
  let backoff = initialBackoffMs;

  while (!signal?.aborted) {
    let ws: WebSocket | undefined;
    try {
      logger.info(`Menghubungkan ke ${masked}`);
      ws = await openSocket(endpoint);
    } catch (err) {
      const reason = err instanceof Error ? err.message.replaceAll(endpoint, masked) : "gagal";
      logger.warn(`Koneksi gagal: ${reason}. Coba lagi dalam ${backoff} ms.`);
      await sleep(backoff + Math.floor(Math.random() * 250), signal);
      backoff = Math.min(backoff * 2, maxBackoffMs);
      continue;
    }

    logger.info("Terhubung ke Xiaozhi.");
    backoff = initialBackoffMs;

    const socket = ws;
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    const onAbort = () => socket.close();
    signal?.addEventListener("abort", onAbort, { once: true });

    let alive = true;
    socket.on("pong", () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        logger.warn("Tidak ada pong dari Xiaozhi; memutus koneksi.");
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, pingIntervalMs);

    const transport = new XiaozhiWebSocketTransport(socket);
    const server = createServer();
    transport.onerror = (err) => logger.warn(`Kesalahan transport: ${err.message}`);

    try {
      await server.connect(transport);
      await closed;
      logger.warn("Koneksi ke Xiaozhi terputus.");
    } catch (err) {
      logger.error(`Kesalahan bridge: ${err instanceof Error ? err.message : "tidak diketahui"}`);
      socket.terminate();
    } finally {
      clearInterval(heartbeat);
      signal?.removeEventListener("abort", onAbort);
      socket.removeAllListeners();
    }

    if (!signal?.aborted) {
      await sleep(backoff + Math.floor(Math.random() * 250), signal);
      backoff = Math.min(backoff * 2, maxBackoffMs);
    }
  }
}
