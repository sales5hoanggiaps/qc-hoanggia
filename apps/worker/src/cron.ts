import cron from "node-cron";
import { runAmisSync } from "./sync/run-sync";
import { logger } from "./logger";

export function scheduleNightlySync(): void {
  const schedule = process.env.AMIS_SYNC_CRON || "0 2 * * *";
  const timezone = process.env.AMIS_SYNC_CRON_TIMEZONE || "Asia/Ho_Chi_Minh";
  cron.schedule(
    schedule,
    () => {
      logger.info("Bắt đầu đồng bộ AMIS theo lịch...");
      runAmisSync().catch((err) => logger.error("Lỗi đồng bộ theo lịch:", err));
    },
    { timezone }
  );
  logger.info(`Đã đặt lịch đồng bộ AMIS: "${schedule}" (${timezone})`);
}
