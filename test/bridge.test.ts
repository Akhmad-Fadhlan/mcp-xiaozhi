import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as ServerSocket } from "ws";
import type { AddressInfo } from "node:net";
import { runBridge } from "../src/bridge.js";
import { maskEndpoint } from "../src/config.js";
import { createJarvisServer } from "../src/server.js";
import { fetchReturning, GOOD_BODY, jsonResponse, SENSOR_URL } from "./helpers.js";

/** Meniru sisi Xiaozhi: WebSocket server yang bertindak sebagai MCP client. */
class FakeXiaozhi {
  readonly wss: WebSocketServer;
  readonly connections: ServerSocket[] = [];
  readonly urls: string[] = [];
  private waiters: Array<(msg: any) => void> = [];

  constructor() {
    this.wss = new WebSocketServer({ port: 0 });
    this.wss.on("connection", (ws, req) => {
      this.connections.push(ws);
      this.urls.push(req.url ?? "");
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        this.waiters.shift()?.(msg);
      });
    });
  }

  get endpoint(): string {
    return `ws://127.0.0.1:${(this.wss.address() as AddressInfo).port}/mcp/?token=SECRET123`;
  }

  async waitForConnection(count = 1): Promise<ServerSocket> {
    for (let i = 0; i < 200 && this.connections.length < count; i++) await new Promise((r) => setTimeout(r, 25));
    expect(this.connections.length).toBeGreaterThanOrEqual(count);
    return this.connections[count - 1]!;
  }

  request(ws: ServerSocket, message: object): Promise<any> {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      ws.send(JSON.stringify(message));
    });
  }

  close(): Promise<void> {
    for (const c of this.connections) c.terminate();
    return new Promise((r) => this.wss.close(() => r()));
  }
}

let fake: FakeXiaozhi | undefined;
let controller: AbortController | undefined;
afterEach(async () => {
  controller?.abort();
  await fake?.close();
  fake = undefined;
});

const silent = { info() {}, warn() {}, error() {} };

function startBridge(endpoint: string) {
  controller = new AbortController();
  return runBridge({
    endpoint,
    signal: controller.signal,
    logger: silent,
    initialBackoffMs: 50,
    maxBackoffMs: 100,
    createServer: () =>
      createJarvisServer({ sensorApiUrl: SENSOR_URL, fetchImpl: fetchReturning(jsonResponse(GOOD_BODY)) }),
  });
}

describe("bridge ke Xiaozhi (WebSocket)", () => {
  it("menjalankan initialize, tools/list, dan tools/call lewat WebSocket", async () => {
    fake = new FakeXiaozhi();
    const done = startBridge(fake.endpoint);
    const ws = await fake.waitForConnection();

    const init = await fake.request(ws, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "xiaozhi", version: "1.0" } },
    });
    expect(init.result.serverInfo.name).toBe("jarvis-iot-mcp");
    ws.send(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));

    const list = await fake.request(ws, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(["get_sensor_data"]);

    const call = await fake.request(ws, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_sensor_data", arguments: {} },
    });
    expect(JSON.parse(call.result.content[0].text)).toMatchObject({ success: true, suhu: 28.5, kelembaban: 72 });

    controller!.abort();
    await done;
  });

  it("menyambung ulang setelah koneksi diputus", async () => {
    fake = new FakeXiaozhi();
    const done = startBridge(fake.endpoint);
    const first = await fake.waitForConnection(1);
    first.terminate();
    const second = await fake.waitForConnection(2);

    const init = await fake.request(second, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "xiaozhi", version: "1.0" } },
    });
    expect(init.result.serverInfo.name).toBe("jarvis-iot-mcp");

    controller!.abort();
    await done;
  });

  it("berhenti bersih saat di-abort walau endpoint tidak tersedia", async () => {
    const done = startBridge("ws://127.0.0.1:1/mcp/?token=X");
    await new Promise((r) => setTimeout(r, 120));
    controller!.abort();
    await expect(done).resolves.toBeUndefined();
  });
});

describe("maskEndpoint", () => {
  it("menyembunyikan token", () => {
    const masked = maskEndpoint("wss://api.xiaozhi.me/mcp/?token=abc.def.ghi");
    expect(masked).not.toContain("abc.def.ghi");
    expect(masked).toContain("token=");
  });
});
