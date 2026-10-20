import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchSensorData, SensorError } from "./sensor.js";

export interface JarvisServerOptions {
  sensorApiUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export const TOOL_NAME = "get_sensor_data";

const TOOL_DESCRIPTION =
  "Mengambil data sensor terbaru berupa suhu, kelembapan udara, dan waktu pencatatan dari Google Apps Script. " +
  "Gunakan tool ini ketika pengguna bertanya mengenai kondisi sensor atau monitoring lingkungan.";

export function createJarvisServer(options: JarvisServerOptions): McpServer {
  const server = new McpServer({ name: "jarvis-iot-mcp", version: "1.0.0" });

  server.registerTool(
    TOOL_NAME,
    { title: "Data Sensor Terbaru", description: TOOL_DESCRIPTION },
    async () => {
      try {
        const reading = await fetchSensorData({
          url: options.sensorApiUrl,
          timeoutMs: options.timeoutMs,
          fetchImpl: options.fetchImpl,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(reading) }] };
      } catch (err) {
        const code = err instanceof SensorError ? err.code : "UNKNOWN";
        const message = err instanceof SensorError ? err.message : "Terjadi kesalahan tak terduga.";
        const failure = {
          success: false,
          error: { code, message },
          catatan: "Data sensor tidak tersedia. Jangan menebak nilai suhu atau kelembapan; sampaikan bahwa data gagal diambil.",
        };
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(failure) }] };
      }
    },
  );

  return server;
}
