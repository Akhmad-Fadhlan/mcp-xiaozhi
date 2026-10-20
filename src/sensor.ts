export type SensorErrorCode =
  | "TIMEOUT"
  | "NETWORK"
  | "HTTP_ERROR"
  | "INVALID_JSON"
  | "API_ERROR"
  | "INVALID_DATA";

export class SensorError extends Error {
  constructor(
    public readonly code: SensorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SensorError";
  }
}

export interface SensorReading {
  success: true;
  timestamp: string;
  suhu: number;
  kelembaban: number;
  satuan: { suhu: "°C"; kelembaban: "%" };
}

export interface FetchSensorOptions {
  url: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 8000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Ambil pembacaan sensor terbaru dari Google Apps Script.
 * Melempar SensorError pada setiap kegagalan; tidak pernah mengarang data.
 */
export async function fetchSensorData(options: FetchSensorOptions): Promise<SensorReading> {
  const { url, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = options;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new SensorError("TIMEOUT", `API sensor tidak merespons dalam ${timeoutMs} ms.`);
    }
    throw new SensorError("NETWORK", "Gagal terhubung ke API sensor.");
  }

  if (!response.ok) {
    throw new SensorError("HTTP_ERROR", `API sensor mengembalikan HTTP ${response.status}.`);
  }

  let body: unknown;
  try {
    const text = await response.text();
    body = JSON.parse(text);
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new SensorError("TIMEOUT", `API sensor tidak selesai merespons dalam ${timeoutMs} ms.`);
    }
    throw new SensorError("INVALID_JSON", "Respons API sensor bukan JSON yang valid.");
  }

  if (!isRecord(body)) {
    throw new SensorError("INVALID_DATA", "Format respons API sensor tidak dikenali.");
  }
  if (body.success !== true) {
    throw new SensorError("API_ERROR", "API sensor melaporkan success bukan true.");
  }

  const data = body.data;
  if (!isRecord(data)) {
    throw new SensorError("INVALID_DATA", "Respons API sensor tidak memuat objek data.");
  }
  const { suhu, kelembaban, timestamp } = data;
  if (typeof suhu !== "number" || !Number.isFinite(suhu)) {
    throw new SensorError("INVALID_DATA", "Nilai suhu bukan angka yang valid.");
  }
  if (typeof kelembaban !== "number" || !Number.isFinite(kelembaban)) {
    throw new SensorError("INVALID_DATA", "Nilai kelembaban bukan angka yang valid.");
  }
  if (typeof timestamp !== "string" || timestamp.trim() === "") {
    throw new SensorError("INVALID_DATA", "Timestamp tidak tersedia.");
  }

  return {
    success: true,
    timestamp,
    suhu,
    kelembaban,
    satuan: { suhu: "°C", kelembaban: "%" },
  };
}
