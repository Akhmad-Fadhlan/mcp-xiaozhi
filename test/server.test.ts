import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createJarvisServer, TOOL_NAME } from "../src/server.js";
import { fetchReturning, GOOD_BODY, hangingFetch, jsonResponse, SENSOR_URL } from "./helpers.js";

async function connect(fetchImpl: typeof fetch, timeoutMs = 8000) {
  const server = createJarvisServer({ sensorApiUrl: SENSOR_URL, fetchImpl, timeoutMs });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0]!.text;
}

describe("tool get_sensor_data", () => {
  it("terdaftar tanpa parameter input", async () => {
    const client = await connect(fetchReturning(jsonResponse(GOOD_BODY)));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([TOOL_NAME]);
    expect(tools[0]!.description).toContain("suhu");
    expect(Object.keys(tools[0]!.inputSchema.properties ?? {})).toHaveLength(0);
  });

  it("mengembalikan data sensor saat dipanggil", async () => {
    const client = await connect(fetchReturning(jsonResponse(GOOD_BODY)));
    const result = await client.callTool({ name: TOOL_NAME, arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(textOf(result))).toEqual({
      success: true,
      timestamp: "2026-09-17 11:31:39",
      suhu: 28.5,
      kelembaban: 72,
      satuan: { suhu: "°C", kelembaban: "%" },
    });
  });

  it("tidak mengarang data saat API gagal", async () => {
    const client = await connect(fetchReturning(jsonResponse({ success: false })));
    const result = await client.callTool({ name: TOOL_NAME, arguments: {} });
    expect(result.isError).toBe(true);
    const body = JSON.parse(textOf(result));
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("API_ERROR");
    expect(body).not.toHaveProperty("suhu");
    expect(body).not.toHaveProperty("kelembaban");
  });

  it("mengembalikan error TIMEOUT saat API lambat", async () => {
    const client = await connect(hangingFetch, 50);
    const result = await client.callTool({ name: TOOL_NAME, arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.parse(textOf(result)).error.code).toBe("TIMEOUT");
  });
});
