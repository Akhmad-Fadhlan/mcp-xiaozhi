import { loadBridgeConfig } from "./config.js";
import { createJarvisServer } from "./server.js";
import { runBridge } from "./bridge.js";
import { startHealthServer, type HealthServer } from "./health.js";

function parsePort(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error("PORT harus bilangan bulat 0-65535.");
  return n;
}

async function main(): Promise<void> {
  const config = loadBridgeConfig(process.env);
  const port = parsePort(process.env.PORT);
  const controller = new AbortController();
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => controller.abort());
  }

  // Opsional: hanya aktif jika PORT diatur (mis. Render Web Service). Tanpa PORT, perilaku tidak berubah.
  let health: HealthServer | undefined;
  if (port !== undefined) {
    health = await startHealthServer(port);
    console.log(`[bridge] Health check aktif di port ${health.port} (GET /health).`);
  }

  try {
    await runBridge({
      endpoint: config.mcpEndpoint,
      signal: controller.signal,
      createServer: () =>
        createJarvisServer({ sensorApiUrl: config.sensorApiUrl, timeoutMs: config.timeoutMs }),
    });
  } finally {
    await health?.close();
  }
}

main().catch((err: unknown) => {
  console.error(`[bridge] Gagal memulai: ${err instanceof Error ? err.message : "tidak diketahui"}`);
  process.exit(1);
});
