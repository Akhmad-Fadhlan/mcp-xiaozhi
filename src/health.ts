import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface HealthServer {
  port: number;
  close(): Promise<void>;
}

/**
 * Server HTTP minimal untuk platform yang mewajibkan port terbuka (mis. Render Web Service)
 * dan untuk pemantau uptime. Hanya GET/HEAD /health; tidak mengembalikan data rahasia.
 */
export function startHealthServer(port: number): Promise<HealthServer> {
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if ((req.method === "GET" || req.method === "HEAD") && path === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(req.method === "HEAD" ? undefined : "ok");
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end(req.method === "HEAD" ? undefined : "not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.removeListener("error", reject);
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
