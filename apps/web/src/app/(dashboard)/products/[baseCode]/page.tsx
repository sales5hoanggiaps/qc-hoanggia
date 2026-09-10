import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProductDetail } from "@/lib/products/get-product-detail";
import { ProductDetailTabs } from "@/components/products/ProductDetailTabs";

export default async function ProductDetailPage({ params }: { params: { baseCode: string } }) {
  const session = await auth();
  // Middleware already requires a session for every route under (dashboard), but don't rely on
  // that alone here — fail safe with an explicit redirect instead of a non-null assertion
  // (a Foundation-phase final review flagged the same `session!` pattern elsewhere as worth
  // avoiding; this plan follows that guidance in new code rather than repeating it).
  if (!session) redirect("/login");

  const product = await getProductDetail(params.baseCode);
  if (!product || !product.currentVersion) notFound();

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">
        {product.baseCode} — {product.currentVersion.name}
      </h1>
      <p className="mb-4 text-sm text-gray-500">
        {product.category?.name ?? "Chưa phân loại"} · Trạng thái: {product.status}
      </p>
      <ProductDetailTabs product={product} role={session.user.role} />
    </div>
  );
}
