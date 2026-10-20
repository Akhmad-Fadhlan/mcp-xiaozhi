import type WebSocket from "ws";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessageSchema, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/**
 * Transport MCP di atas WebSocket klien yang sudah terbuka ke endpoint Xiaozhi.
 * Xiaozhi bertindak sebagai MCP client; pesan JSON-RPC dikirim sebagai text frame.
 */
export class XiaozhiWebSocketTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(private readonly ws: WebSocket) {}

  async start(): Promise<void> {
    this.ws.on("message", (raw) => {
      try {
        const parsed = JSONRPCMessageSchema.parse(JSON.parse(raw.toString()));
        this.onmessage?.(parsed);
      } catch (err) {
        this.onerror?.(err instanceof Error ? err : new Error("Pesan JSON-RPC tidak valid."));
      }
    });
    this.ws.on("close", () => this.onclose?.());
    this.ws.on("error", (err) => this.onerror?.(err));
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== this.ws.OPEN) {
        reject(new Error("WebSocket tidak dalam keadaan terbuka."));
        return;
      }
      this.ws.send(JSON.stringify(message), (err) => (err ? reject(err) : resolve()));
    });
  }

  async close(): Promise<void> {
    if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) {
      this.ws.close();
    }
  }
}
