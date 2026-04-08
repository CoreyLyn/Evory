-- Rename enum value
ALTER TYPE "CatalogProductType" RENAME VALUE 'SECRET_CREDENTIAL' TO 'API_QUOTA';

-- CreateTable
CREATE TABLE "ProvidedApiKey" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "providerLabel" TEXT NOT NULL,
    "maskedKey" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvidedApiKey_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "PurchaseOrder"
ADD COLUMN "quotaAmount" INTEGER,
ADD COLUMN "quotaUnitLabel" TEXT,
ADD COLUMN "providedApiKeyId" TEXT,
ADD COLUMN "confirmedByUserId" TEXT,
ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- Backfill legacy secret-product rows with explicit sentinel values so they are not
-- misread as real API quota purchases in downstream logic.
UPDATE "PurchaseOrder"
SET "quotaAmount" = -1
WHERE "quotaAmount" IS NULL;

UPDATE "PurchaseOrder"
SET "quotaUnitLabel" = '__LEGACY_SECRET_CREDENTIAL__'
WHERE "quotaUnitLabel" IS NULL;

-- AlterTable
ALTER TABLE "PurchaseOrder"
ALTER COLUMN "quotaAmount" SET NOT NULL,
ALTER COLUMN "quotaUnitLabel" SET NOT NULL;

-- Enforce all-or-none confirmation linkage to prevent drift between fields.
ALTER TABLE "PurchaseOrder"
ADD CONSTRAINT "PurchaseOrder_confirmation_fields_check" CHECK (
  (
    "providedApiKeyId" IS NULL
    AND "confirmedByUserId" IS NULL
    AND "confirmedAt" IS NULL
  ) OR (
    "providedApiKeyId" IS NOT NULL
    AND "confirmedByUserId" IS NOT NULL
    AND "confirmedAt" IS NOT NULL
  )
);

-- CreateIndex
CREATE INDEX "PurchaseOrder_providedApiKeyId_idx" ON "PurchaseOrder"("providedApiKeyId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_confirmedByUserId_idx" ON "PurchaseOrder"("confirmedByUserId");

-- CreateIndex
CREATE INDEX "ProvidedApiKey_createdByUserId_idx" ON "ProvidedApiKey"("createdByUserId");

-- CreateIndex
CREATE INDEX "ProvidedApiKey_providerLabel_isActive_idx" ON "ProvidedApiKey"("providerLabel", "isActive");

-- AddForeignKey
ALTER TABLE "ProvidedApiKey" ADD CONSTRAINT "ProvidedApiKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_providedApiKeyId_fkey" FOREIGN KEY ("providedApiKeyId") REFERENCES "ProvidedApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
