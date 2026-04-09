CREATE TYPE "UserProvidedApiKeyApplicationStatus" AS ENUM (
  'PENDING',
  'FULFILLED',
  'FAILED'
);

CREATE TABLE "UserProvidedApiKeyApplication" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "providedApiKeyId" TEXT,
  "status" "UserProvidedApiKeyApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fulfilledAt" TIMESTAMP(3),
  "fulfilledByUserId" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserProvidedApiKeyApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserProvidedApiKeyApplication_userId_status_idx"
  ON "UserProvidedApiKeyApplication"("userId", "status");

CREATE INDEX "UserProvidedApiKeyApplication_providedApiKeyId_idx"
  ON "UserProvidedApiKeyApplication"("providedApiKeyId");

CREATE INDEX "UserProvidedApiKeyApplication_fulfilledByUserId_idx"
  ON "UserProvidedApiKeyApplication"("fulfilledByUserId");

CREATE INDEX "UserProvidedApiKeyApplication_status_requestedAt_idx"
  ON "UserProvidedApiKeyApplication"("status", "requestedAt");

ALTER TABLE "UserProvidedApiKeyApplication"
  ADD CONSTRAINT "UserProvidedApiKeyApplication_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserProvidedApiKeyApplication"
  ADD CONSTRAINT "UserProvidedApiKeyApplication_providedApiKeyId_fkey"
  FOREIGN KEY ("providedApiKeyId") REFERENCES "ProvidedApiKey"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserProvidedApiKeyApplication"
  ADD CONSTRAINT "UserProvidedApiKeyApplication_fulfilledByUserId_fkey"
  FOREIGN KEY ("fulfilledByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserProvidedApiKeyApplication"
  ADD CONSTRAINT "UserProvidedApiKeyApplication_status_fields_check"
  CHECK (
    (
      "status" = 'PENDING'
      AND "providedApiKeyId" IS NULL
      AND "fulfilledAt" IS NULL
      AND "fulfilledByUserId" IS NULL
      AND "failureReason" IS NULL
    ) OR (
      "status" = 'FULFILLED'
      AND "providedApiKeyId" IS NOT NULL
      AND "fulfilledAt" IS NOT NULL
      AND "fulfilledByUserId" IS NOT NULL
      AND "failureReason" IS NULL
    ) OR (
      "status" = 'FAILED'
      AND "providedApiKeyId" IS NULL
      AND "fulfilledAt" IS NOT NULL
      AND "fulfilledByUserId" IS NOT NULL
      AND "failureReason" IS NOT NULL
    )
  );
