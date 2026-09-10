import cron from "node-cron";
import { runAmisSync, SyncAlreadyRunningError } from "./sync/run-sync";
import { logger } from "./logger";

export function scheduleNightlySync(): void {
  const schedule = process.env.AMIS_SYNC_CRON || "0 2 * * *";
  const timezone = process.env.AMIS_SYNC_CRON_TIMEZONE || "Asia/Ho_Chi_Minh";
  cron.schedule(
    schedule,
    () => {
      logger.info("Bắt đầu đồng bộ AMIS theo lịch...");
      runAmisSync().catch((err) => {
        if (err instanceof SyncAlreadyRunningError) {
          logger.info("Bỏ qua lượt đồng bộ theo lịch: đang có 1 lượt đồng bộ khác (thủ công hoặc lịch trước đó) chạy chưa xong.");
          return;
        }
        logger.error("Lỗi đồng bộ theo lịch:", err);
      });
    },
    { timezone }
  );
  logger.info(`Đã đặt lịch đồng bộ AMIS: "${schedule}" (${timezone})`);
}
