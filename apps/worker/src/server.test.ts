import { describe, expect, it, vi, beforeEach } from "vitest";
import { createServer } from "./server";

vi.mock("./sync/run-sync", () => ({
  runAmisSync: vi.fn(async () => ({ newProducts: 1, newVersions: 0, updatedLinks: 2, syncLogId: "log1" })),
}));

describe("worker HTTP server", () => {
  beforeEach(() => {
    process.env.SYNC_INTERNAL_TOKEN = "test-token";
  });

  it("POST /sync với token đúng trả về kết quả đồng bộ", async () => {
    const server = createServer();
    server.listen(0);
    const port = (server.address() as { port: number }).port;

    const response = await fetch(`http://127.0.0.1:${port}/sync`, {
      method: "POST",
      headers: { "x-internal-token": "test-token" },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.newProducts).toBe(1);
    server.close();
  });

  it("POST /sync với token sai trả về 401", async () => {
    const server = createServer();
    server.listen(0);
    const port = (server.address() as { port: number }).port;

    const response = await fetch(`http://127.0.0.1:${port}/sync`, {
      method: "POST",
      headers: { "x-internal-token": "sai-token" },
    });
    expect(response.status).toBe(401);
    server.close();
  });
});
