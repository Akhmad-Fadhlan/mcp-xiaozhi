import { afterEach, describe, expect, it } from "vitest";
import { startHealthServer, type HealthServer } from "../src/health.js";

let health: HealthServer | undefined;
afterEach(async () => {
  await health?.close();
  health = undefined;
});

describe("health server", () => {
  it("menjawab GET /health dengan 200 ok", async () => {
    health = await startHealthServer(0);
    const res = await fetch(`http://127.0.0.1:${health.port}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("menjawab HEAD /health dengan 200", async () => {
    health = await startHealthServer(0);
    const res = await fetch(`http://127.0.0.1:${health.port}/health`, { method: "HEAD" });
    expect(res.status).toBe(200);
  });

  it("menolak path lain dan tidak membocorkan apa pun", async () => {
    health = await startHealthServer(0);
    const res = await fetch(`http://127.0.0.1:${health.port}/.env`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("not found");
  });
});
