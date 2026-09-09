-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('QC_STAFF', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'PENDING_QC', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('COA', 'MSDS', 'ROHS', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "amisCustomerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "baseCode" TEXT NOT NULL,
    "amisProductId" TEXT NOT NULL,
    "categoryId" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'PENDING_QC',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCustomer" (
    "productId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "lastOrderDate" TIMESTAMP(3),

    CONSTRAINT "ProductCustomer_pkey" PRIMARY KEY ("productId","customerId")
);

-- CreateTable
CREATE TABLE "ProductVersion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "amisProductId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdByAmisSync" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TCSPData" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "materialCode" TEXT,
    "description" TEXT,
    "preparedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "TCSPData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TCSPSpecRow" (
    "id" TEXT NOT NULL,
    "tcspId" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "criterion" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "tolerance" TEXT,
    "unit" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TCSPSpecRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QCData" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "checklist" TEXT,
    "knownDefects" TEXT,
    "specialNotes" TEXT,

    CONSTRAINT "QCData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingData" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "instructions" TEXT,
    "specialNotes" TEXT,

    CONSTRAINT "PackagingData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentsData" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,

    CONSTRAINT "DocumentsData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDocument" (
    "id" TEXT NOT NULL,
    "documentsId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "label" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tcspId" TEXT,
    "qcId" TEXT,
    "packagingId" TEXT,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeLogEntry" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "ChangeLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "newProducts" INTEGER NOT NULL DEFAULT 0,
    "updatedLinks" INTEGER NOT NULL DEFAULT 0,
    "newVersions" INTEGER NOT NULL DEFAULT 0,
    "flaggedReview" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_amisCustomerId_key" ON "Customer"("amisCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_baseCode_key" ON "Product"("baseCode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_amisProductId_key" ON "Product"("amisProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_currentVersionId_key" ON "Product"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVersion_amisProductId_key" ON "ProductVersion"("amisProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVersion_productId_versionNumber_key" ON "ProductVersion"("productId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TCSPData_versionId_key" ON "TCSPData"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "QCData_versionId_key" ON "QCData"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingData_versionId_key" ON "PackagingData"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentsData_versionId_key" ON "DocumentsData"("versionId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ProductVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCustomer" ADD CONSTRAINT "ProductCustomer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCustomer" ADD CONSTRAINT "ProductCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVersion" ADD CONSTRAINT "ProductVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TCSPData" ADD CONSTRAINT "TCSPData_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProductVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TCSPSpecRow" ADD CONSTRAINT "TCSPSpecRow_tcspId_fkey" FOREIGN KEY ("tcspId") REFERENCES "TCSPData"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCData" ADD CONSTRAINT "QCData_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProductVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingData" ADD CONSTRAINT "PackagingData_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProductVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentsData" ADD CONSTRAINT "DocumentsData_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProductVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDocument" ADD CONSTRAINT "ProductDocument_documentsId_fkey" FOREIGN KEY ("documentsId") REFERENCES "DocumentsData"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_tcspId_fkey" FOREIGN KEY ("tcspId") REFERENCES "TCSPData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_qcId_fkey" FOREIGN KEY ("qcId") REFERENCES "QCData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_packagingId_fkey" FOREIGN KEY ("packagingId") REFERENCES "PackagingData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeLogEntry" ADD CONSTRAINT "ChangeLogEntry_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProductVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
