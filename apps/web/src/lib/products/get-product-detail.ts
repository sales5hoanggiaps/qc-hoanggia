import { prisma } from "@qc/db";

export async function getProductDetail(baseCode: string) {
  return prisma.product.findUnique({
    where: { baseCode },
    include: {
      category: true,
      currentVersion: {
        include: {
          tcsp: { include: { specRows: { orderBy: { sortOrder: "asc" } } } },
          qc: true,
          packaging: true,
          documents: { include: { files: true } },
        },
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          changeLogs: { orderBy: { changedAt: "desc" } },
          tcsp: true,
          qc: true,
          packaging: true,
        },
      },
    },
  });
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;
