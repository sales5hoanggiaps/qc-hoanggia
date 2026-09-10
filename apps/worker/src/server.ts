import http from "node:http";
import { runAmisSync } from "./sync/run-sync";
import { logger } from "./logger";

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/sync") {
      res.writeHead(404).end();
      return;
    }

    const token = req.headers["x-internal-token"];
    if (!token || token !== process.env.SYNC_INTERNAL_TOKEN) {
      res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    try {
      const result = await runAmisSync();
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (err) {
      logger.error("Lỗi xử lý /sync:", err);
      res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Đồng bộ thất bại" }));
    }
  });
}
