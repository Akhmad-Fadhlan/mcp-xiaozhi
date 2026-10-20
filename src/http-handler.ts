import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { loadSensorConfig } from "./config.js";
import { createJarvisServer } from "./server.js";

export interface HttpHandlerOptions {
  env: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function bearerMatches(header: string | null, expected: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * Endpoint MCP Streamable HTTP (stateless) untuk klien MCP umum (Claude, Cursor, MCP Inspector).
 * Gagal tertutup: tanpa MCP_AUTH_TOKEN di environment, semua request ditolak.
 * Catatan: Xiaozhi TIDAK memakai endpoint ini; Xiaozhi memakai bridge WebSocket keluar.
 */
export async function handleMcpRequest(request: Request, options: HttpHandlerOptions): Promise<Response> {
  const authToken = options.env.MCP_AUTH_TOKEN?.trim();
  if (!authToken) {
    return json(503, { error: "Server belum dikonfigurasi: MCP_AUTH_TOKEN tidak diatur." });
  }
  if (!bearerMatches(request.headers.get("authorization"), authToken)) {
    return json(401, { error: "Tidak diizinkan." }, { "www-authenticate": "Bearer" });
  }

  let sensor;
  try {
    sensor = loadSensorConfig(options.env);
  } catch {
    return json(503, { error: "Server belum dikonfigurasi: SENSOR_API_URL tidak valid." });
  }

  const server = createJarvisServer({
    sensorApiUrl: sensor.sensorApiUrl,
    timeoutMs: sensor.timeoutMs,
    fetchImpl: options.fetchImpl,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // Respons JSON sudah lengkap saat handleRequest selesai; bebaskan server per-request.
    void server.close();
  }
}
