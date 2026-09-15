import { notFound, redirect } from "next/navigation";
import { prisma } from "@qc/db";
import { auth } from "@/lib/auth";
import { getProductDetail } from "@/lib/products/get-product-detail";
import { buildMediaUrlMap } from "@/lib/products/build-media-url-map";
import { ProductDetailTabs } from "@/components/products/ProductDetailTabs";
import { StatusBadge } from "@/components/ui/StatusBadge";

export default async function ProductDetailPage({ params }: { params: { baseCode: string } }) {
  const session = await auth();
  // Middleware already requires a session for every route under (dashboard), but don't rely on
  // that alone here — fail safe with an explicit redirect instead of a non-null assertion
  // (a Foundation-phase final review flagged the same `session!` pattern elsewhere as worth
  // avoiding; this plan follows that guidance in new code rather than repeating it).
  if (!session) redirect("/login");

  const product = await getProductDetail(params.baseCode);
  if (!product || !product.currentVersion) notFound();

  const mediaUrls = await buildMediaUrlMap(product.currentVersion);
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-brand-600">{product.baseCode}</p>
          <h1 className="mt-0.5 text-2xl font-semibold text-gray-900">{product.currentVersion.name}</h1>
          <p className="mt-1 text-sm text-gray-500">{product.category?.name ?? "Chưa phân loại"}</p>
        </div>
        <StatusBadge status={product.status} />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
        <ProductDetailTabs product={product} role={session.user.role} mediaUrls={mediaUrls} categories={categories} />
      </div>
    </div>
  );
}
