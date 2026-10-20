import { loadBridgeConfig } from "./config.js";
import { createJarvisServer } from "./server.js";
import { runBridge } from "./bridge.js";

async function main(): Promise<void> {
  const config = loadBridgeConfig(process.env);
  const controller = new AbortController();
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => controller.abort());
  }

  await runBridge({
    endpoint: config.mcpEndpoint,
    signal: controller.signal,
    createServer: () =>
      createJarvisServer({ sensorApiUrl: config.sensorApiUrl, timeoutMs: config.timeoutMs }),
  });
}

main().catch((err: unknown) => {
  console.error(`[bridge] Gagal memulai: ${err instanceof Error ? err.message : "tidak diketahui"}`);
  process.exit(1);
});
