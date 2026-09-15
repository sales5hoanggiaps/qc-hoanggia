-- CreateEnum
CREATE TYPE "ProductGroup" AS ENUM ('SAN_XUAT', 'THUONG_MAI', 'GIA_CONG');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "productGroup" "ProductGroup";
