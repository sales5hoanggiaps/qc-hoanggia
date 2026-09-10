import "./env"; // side-effect: loads infra/.env into process.env — must be the first import
import { createServer } from "./server";
import { scheduleNightlySync } from "./cron";
import { logger } from "./logger";

const port = Number(process.env.WORKER_PORT) || 4100;

createServer().listen(port, () => {
  logger.info(`Worker HTTP server đang chạy tại cổng ${port}`);
});

scheduleNightlySync();
