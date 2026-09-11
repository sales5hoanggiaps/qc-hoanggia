import { prisma } from "@qc/db";

export async function getProductDetail(baseCode: string) {
  return prisma.product.findUnique({
    where: { baseCode },
    include: {
      category: true,
      currentVersion: {
        include: {
          tcsp: { include: { specRows: { orderBy: { sortOrder: "asc" } }, media: { orderBy: { sortOrder: "asc" } } } },
          qc: { include: { media: { orderBy: { sortOrder: "asc" } } } },
          packaging: { include: { media: { orderBy: { sortOrder: "asc" } } } },
          documents: { include: { files: { orderBy: { uploadedAt: "desc" } } } },
        },
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          changeLogs: { orderBy: { changedAt: "desc" } },
          tcsp: { include: { specRows: { orderBy: { sortOrder: "asc" } }, media: { orderBy: { sortOrder: "asc" } } } },
          qc: { include: { media: { orderBy: { sortOrder: "asc" } } } },
          packaging: { include: { media: { orderBy: { sortOrder: "asc" } } } },
          documents: { include: { files: { orderBy: { uploadedAt: "desc" } } } },
        },
      },
    },
  });
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;
