import type { ProductStatus } from "@qc/db";

const STYLES: Record<ProductStatus, string> = {
  ACTIVE: "bg-green-50 text-green-700 ring-green-600/20",
  PENDING_QC: "bg-amber-50 text-amber-700 ring-amber-600/20",
  DISCONTINUED: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

export const STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE: "Đang hoạt động",
  PENDING_QC: "Chờ bổ sung QC",
  DISCONTINUED: "Ngừng kinh doanh",
};

/** Badge màu theo trạng thái mã hàng — dùng chung ở trang chi tiết, Danh sách mã hàng, và bất kỳ
 * chỗ nào khác cần hiển thị `ProductStatus` (thay vì in thẳng tên enum tiếng Anh). */
export function StatusBadge({ status }: { status: ProductStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
