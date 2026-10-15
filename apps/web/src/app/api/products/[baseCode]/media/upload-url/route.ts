import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError, PRODUCT_EDITORS } from "@/lib/auth/guard";
import { buildStorageKey, getUploadUrl, validateMediaUpload, UploadValidationError } from "@qc/storage";

const bodySchema = z.object({
  tab: z.enum(["tcsp", "qc", "packaging"]),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
});

export async function POST(req: Request, { params }: { params: { baseCode: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, PRODUCT_EDITORS);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  if (!session) return NextResponse.json({ error: "Không đủ quyền truy cập" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const product = await prisma.product.findUnique({ where: { baseCode: params.baseCode } });
  if (!product || !product.currentVersionId) {
    return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });
  }

  try {
    validateMediaUpload(parsed.data.mimeType, parsed.data.size);
  } catch (err) {
    if (err instanceof UploadValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const storageKey = buildStorageKey(params.baseCode, product.currentVersionId, parsed.data.fileName);
  const uploadUrl = await getUploadUrl({ storageKey, mimeType: parsed.data.mimeType, size: parsed.data.size });

  return NextResponse.json({ uploadUrl, storageKey });
}
