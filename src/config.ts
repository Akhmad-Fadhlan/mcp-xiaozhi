export interface SensorConfig {
  sensorApiUrl: string;
  timeoutMs: number;
}

export interface BridgeConfig extends SensorConfig {
  mcpEndpoint: string;
}

type Env = Record<string, string | undefined>;

function parseTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 8000;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 500 || n > 30000) {
    throw new Error("SENSOR_TIMEOUT_MS harus bilangan bulat antara 500 dan 30000.");
  }
  return n;
}

export function loadSensorConfig(env: Env): SensorConfig {
  const raw = env.SENSOR_API_URL?.trim();
  if (!raw) throw new Error("SENSOR_API_URL belum diatur.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("SENSOR_API_URL bukan URL yang valid.");
  }
  if (url.protocol !== "https:") throw new Error("SENSOR_API_URL harus memakai https.");
  return { sensorApiUrl: url.toString(), timeoutMs: parseTimeout(env.SENSOR_TIMEOUT_MS) };
}

export function loadBridgeConfig(env: Env): BridgeConfig {
  const sensor = loadSensorConfig(env);
  const raw = env.MCP_ENDPOINT?.trim();
  if (!raw) throw new Error("MCP_ENDPOINT belum diatur (salin dari Xiaozhi Console).");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("MCP_ENDPOINT bukan URL yang valid.");
  }
  if (url.protocol !== "wss:") throw new Error("MCP_ENDPOINT harus berawalan wss://.");
  return { ...sensor, mcpEndpoint: raw };
}

/** Sembunyikan nilai token pada URL agar aman ditulis ke log. */
export function maskEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    if (url.searchParams.has("token")) url.searchParams.set("token", "***");
    return url.toString();
  } catch {
    return "[endpoint tidak valid]";
  }
}
