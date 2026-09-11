import { getViewUrl } from "@qc/storage";
import type { ProductDetail } from "./get-product-detail";

type VersionWithMedia = NonNullable<ProductDetail["currentVersion"]> | ProductDetail["versions"][number];

/** Tạo map {id (MediaAsset hoặc ProductDocument) -> link GET đã ký} cho TOÀN BỘ media/tài liệu của 1
 * phiên bản — gọi 1 lần mỗi khi trang render (server-side), không lưu/cache lại ở đâu khác (spec §7). */
export async function buildMediaUrlMap(version: VersionWithMedia | null | undefined): Promise<Record<string, string>> {
  if (!version) return {};
  const items: { id: string; storageKey: string }[] = [
    ...(version.tcsp?.media ?? []),
    ...(version.qc?.media ?? []),
    ...(version.packaging?.media ?? []),
    ...(version.documents?.files ?? []),
  ];
  const entries = await Promise.all(items.map(async (item) => [item.id, await getViewUrl(item.storageKey)] as const));
  return Object.fromEntries(entries);
}
