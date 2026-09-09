import { PrismaClient, UserRole, ProductStatus, DocumentKind } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { UserRole, ProductStatus, DocumentKind };
export type {
  User,
  Category,
  Customer,
  Product,
  ProductVersion,
  TCSPData,
  TCSPSpecRow,
  QCData,
  PackagingData,
  DocumentsData,
  ProductDocument,
  MediaAsset,
  ChangeLogEntry,
  SyncLog,
} from "@prisma/client";
