import { describe, expect, it } from "vitest";
import { fetchSensorData, SensorError } from "../src/sensor.js";
import { fetchReturning, GOOD_BODY, hangingFetch, jsonResponse, SENSOR_URL } from "./helpers.js";

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof SensorError) return err.code;
    throw err;
  }
  throw new Error("Seharusnya gagal");
}

describe("fetchSensorData", () => {
  it("mengembalikan data terstruktur saat berhasil", async () => {
    const result = await fetchSensorData({ url: SENSOR_URL, fetchImpl: fetchReturning(jsonResponse(GOOD_BODY)) });
    expect(result).toEqual({
      success: true,
      timestamp: "2026-09-17 11:31:39",
      suhu: 28.5,
      kelembaban: 72,
      satuan: { suhu: "°C", kelembaban: "%" },
    });
  });

  it("menolak API dengan success false", async () => {
    const f = fetchReturning(jsonResponse({ success: false, error: "x" }));
    expect(await codeOf(fetchSensorData({ url: SENSOR_URL, fetchImpl: f }))).toBe("API_ERROR");
  });

  it("menolak JSON tidak valid", async () => {
    const f = fetchReturning(() => new Response("<html>bukan json</html>", { status: 200 }));
    expect(await codeOf(fetchSensorData({ url: SENSOR_URL, fetchImpl: f }))).toBe("INVALID_JSON");
  });

  it("menolak status HTTP non-2xx", async () => {
    const f = fetchReturning(() => new Response("err", { status: 500 }));
    expect(await codeOf(fetchSensorData({ url: SENSOR_URL, fetchImpl: f }))).toBe("HTTP_ERROR");
  });

  it("melaporkan timeout", async () => {
    expect(await codeOf(fetchSensorData({ url: SENSOR_URL, fetchImpl: hangingFetch, timeoutMs: 50 }))).toBe("TIMEOUT");
  });

  it("melaporkan kegagalan jaringan", async () => {
    const f = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await codeOf(fetchSensorData({ url: SENSOR_URL, fetchImpl: f }))).toBe("NETWORK");
  });

  it.each([
    ["suhu string", { success: true, data: { timestamp: "t", suhu: "28.5", kelembaban: 72 } }],
    ["kelembaban null", { success: true, data: { timestamp: "t", suhu: 28, kelembaban: null } }],
    ["data hilang", { success: true }],
    ["timestamp hilang", { success: true, data: { suhu: 28, kelembaban: 72 } }],
    ["body bukan objek", [1, 2, 3]],
  ])("menolak data tidak valid: %s", async (_name, body) => {
    const f = fetchReturning(jsonResponse(body));
    expect(await codeOf(fetchSensorData({ url: SENSOR_URL, fetchImpl: f }))).toBe("INVALID_DATA");
  });
});
