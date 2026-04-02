-- CreateEnum
CREATE TYPE "CatalogProductType" AS ENUM ('COSMETIC', 'SECRET_CREDENTIAL');

-- CreateEnum
CREATE TYPE "ShopCurrencyType" AS ENUM ('POINTS');

-- CreateEnum
CREATE TYPE "SecretInventoryStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'VOID');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('PENDING', 'FULFILLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PurchaseDeliveryChannel" AS ENUM ('AGENT_CHAT');

-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "productType" "CatalogProductType" NOT NULL,
    "price" INTEGER NOT NULL,
    "currencyType" "ShopCurrencyType" NOT NULL DEFAULT 'POINTS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayConfig" JSONB NOT NULL DEFAULT '{}',
    "fulfillmentConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretImportBatch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "importedByUserId" TEXT NOT NULL,
    "importCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecretImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "buyerAgentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "pricePaid" INTEGER NOT NULL,
    "currencyType" "ShopCurrencyType" NOT NULL DEFAULT 'POINTS',
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryChannel" "PurchaseDeliveryChannel" NOT NULL DEFAULT 'AGENT_CHAT',
    "failureReason" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretInventory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "maskedValue" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "status" "SecretInventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
    "importBatchId" TEXT,
    "soldOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soldAt" TIMESTAMP(3),

    CONSTRAINT "SecretInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretDeliveryReceipt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "secretInventoryId" TEXT NOT NULL,
    "buyerAgentId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecretDeliveryReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogProduct_productType_isActive_idx" ON "CatalogProduct"("productType", "isActive");

-- CreateIndex
CREATE INDEX "SecretImportBatch_productId_idx" ON "SecretImportBatch"("productId");

-- CreateIndex
CREATE INDEX "SecretImportBatch_importedByUserId_idx" ON "SecretImportBatch"("importedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SecretInventory_soldOrderId_key" ON "SecretInventory"("soldOrderId");

-- CreateIndex
CREATE INDEX "SecretInventory_productId_status_idx" ON "SecretInventory"("productId", "status");

-- CreateIndex
CREATE INDEX "SecretInventory_importBatchId_idx" ON "SecretInventory"("importBatchId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_buyerAgentId_idx" ON "PurchaseOrder"("buyerAgentId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_productId_idx" ON "PurchaseOrder"("productId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SecretDeliveryReceipt_orderId_key" ON "SecretDeliveryReceipt"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SecretDeliveryReceipt_secretInventoryId_key" ON "SecretDeliveryReceipt"("secretInventoryId");

-- CreateIndex
CREATE INDEX "SecretDeliveryReceipt_buyerAgentId_idx" ON "SecretDeliveryReceipt"("buyerAgentId");

-- AddForeignKey
ALTER TABLE "SecretImportBatch" ADD CONSTRAINT "SecretImportBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretImportBatch" ADD CONSTRAINT "SecretImportBatch_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_buyerAgentId_fkey" FOREIGN KEY ("buyerAgentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretInventory" ADD CONSTRAINT "SecretInventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretInventory" ADD CONSTRAINT "SecretInventory_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "SecretImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretInventory" ADD CONSTRAINT "SecretInventory_soldOrderId_fkey" FOREIGN KEY ("soldOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretDeliveryReceipt" ADD CONSTRAINT "SecretDeliveryReceipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretDeliveryReceipt" ADD CONSTRAINT "SecretDeliveryReceipt_secretInventoryId_fkey" FOREIGN KEY ("secretInventoryId") REFERENCES "SecretInventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretDeliveryReceipt" ADD CONSTRAINT "SecretDeliveryReceipt_buyerAgentId_fkey" FOREIGN KEY ("buyerAgentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
