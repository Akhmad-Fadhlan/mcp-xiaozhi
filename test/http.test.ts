import { describe, expect, it } from "vitest";
import { handleMcpRequest } from "../src/http-handler.js";
import { fetchReturning, GOOD_BODY, jsonResponse, SENSOR_URL } from "./helpers.js";

const env = { MCP_AUTH_TOKEN: "rahasia-test", SENSOR_API_URL: SENSOR_URL };
const fetchImpl = fetchReturning(jsonResponse(GOOD_BODY));

function rpc(body: object, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("endpoint HTTP MCP", () => {
  it("menolak request tanpa Authorization", async () => {
    const res = await handleMcpRequest(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }), { env, fetchImpl });
    expect(res.status).toBe(401);
  });

  it("menolak token yang salah", async () => {
    const res = await handleMcpRequest(
      rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { authorization: "Bearer salah" }),
      { env, fetchImpl },
    );
    expect(res.status).toBe(401);
  });

  it("gagal tertutup saat MCP_AUTH_TOKEN tidak diatur", async () => {
    const res = await handleMcpRequest(
      rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { authorization: "Bearer apa-saja" }),
      { env: { SENSOR_API_URL: SENSOR_URL }, fetchImpl },
    );
    expect(res.status).toBe(503);
  });

  it("melayani tools/list dan tools/call dengan token benar", async () => {
    const auth = { authorization: "Bearer rahasia-test" };
    const list = await handleMcpRequest(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, auth), { env, fetchImpl });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { result: { tools: Array<{ name: string }> } };
    expect(listBody.result.tools[0]!.name).toBe("get_sensor_data");

    const call = await handleMcpRequest(
      rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_sensor_data", arguments: {} } }, auth),
      { env, fetchImpl },
    );
    expect(call.status).toBe(200);
    const callBody = (await call.json()) as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(callBody.result.content[0]!.text)).toMatchObject({ success: true, suhu: 28.5, kelembaban: 72 });
  });
});
