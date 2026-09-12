import { NextResponse } from "next/server";
import { prisma } from "@qc/db";
import { auth } from "@/lib/auth";
import { buildTcspWorkbook } from "@/lib/tcsp-export/build-workbook";
import { getViewUrl } from "@qc/storage";

// Ảnh có thể nhúng vào .xlsx (exceljs chỉ hỗ trợ 3 định dạng này khi ghi Content-Type thật — xem
// ghi chú tại TcspExportInput.imageExtension). Media đầu tiên của tab TCSP không nhất thiết là ảnh
// hợp lệ (có thể là video/mp4, hoặc ảnh webp mà exceljs không hỗ trợ) — mimeType nào không map được
// thì bỏ qua việc nhúng ảnh hoàn toàn (giống trường hợp không có ảnh), thay vì nhúng nhầm bytes sai
// định dạng vào file.
const EMBEDDABLE_IMAGE_EXTENSION: Record<string, "jpeg" | "png" | "gif"> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/gif": "gif",
};

// Không đọc đủ quyền (chỉ tải/xuất, không phải sửa) nên cho phép cả 3 role — khác PATCH tcsp/route.ts
// (chỉ MANAGER/ADMIN được sửa).
export async function GET(req: Request, { params }: { params: { baseCode: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Không đủ quyền truy cập" }, { status: 403 });

  const product = await prisma.product.findUnique({
    where: { baseCode: params.baseCode },
    include: {
      currentVersion: { include: { tcsp: { include: { specRows: { orderBy: { sortOrder: "asc" } }, media: { orderBy: { sortOrder: "asc" }, take: 1 } } } } },
      versions: {
        include: { tcsp: { include: { specRows: { orderBy: { sortOrder: "asc" } }, media: { orderBy: { sortOrder: "asc" }, take: 1 } } } },
      },
    },
  });
  if (!product) return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });

  const requestedVersion = new URL(req.url).searchParams.get("version");
  const version = requestedVersion
    ? product.versions.find((v) => v.versionNumber === Number(requestedVersion))
    : product.currentVersion;
  if (!version) return NextResponse.json({ error: "Không tìm thấy phiên bản" }, { status: 404 });

  const firstMedia = version.tcsp?.media[0];
  const imageExtension = firstMedia ? EMBEDDABLE_IMAGE_EXTENSION[firstMedia.mimeType] : undefined;
  let imageBuffer: Buffer | null = null;
  if (firstMedia && imageExtension) {
    const url = await getViewUrl(firstMedia.storageKey);
    const res = await fetch(url);
    if (res.ok) imageBuffer = Buffer.from(await res.arrayBuffer());
  }

  const buffer = await buildTcspWorkbook({
    baseCode: product.baseCode,
    versionNumber: version.versionNumber,
    name: version.name,
    materialCode: version.tcsp?.materialCode ?? null,
    description: version.tcsp?.description ?? null,
    preparedBy: version.tcsp?.preparedBy ?? null,
    approvedBy: version.tcsp?.approvedBy ?? null,
    approvedAt: version.tcsp?.approvedAt ?? null,
    specRows: version.tcsp?.specRows ?? [],
    imageBuffer,
    imageExtension,
  });

  // `NextResponse`'s BodyInit type doesn't list Node's `Buffer` — same cross-package Buffer-type
  // friction documented in build-workbook.ts (Buffer IS a Uint8Array at runtime, which BodyInit does
  // accept; this is a types-only gap, not a runtime issue).
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="TCSP-${product.baseCode}.${version.versionNumber}.xlsx"`,
    },
  });
}
