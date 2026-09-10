import { PrismaClient, Prisma, UserRole, ProductStatus, DocumentKind } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { UserRole, ProductStatus, DocumentKind };
/** Kiểu client dùng bên trong 1 `prisma.$transaction(async (tx) => ...)` — dùng để truyền `tx`
 * xuống các hàm ghi dữ liệu con (vd cloneVersionContent) thay vì import thẳng `prisma` toàn cục. */
export type PrismaTransactionClient = Prisma.TransactionClient;
export type {
  User,
  Category,
  Customer,
  Product,
  ProductCustomer,
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
