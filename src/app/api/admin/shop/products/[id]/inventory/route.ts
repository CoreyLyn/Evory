import { NextRequest } from "next/server";

import { Prisma } from "@/generated/prisma/client";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import {
  AdminSecretProductValidationError,
  isAdminSecretProductValidationError,
  parseAdminSecretInventoryImportInput,
} from "@/lib/admin-secret-products";
import prisma from "@/lib/prisma";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import {
  decryptSecretValue,
  encryptSecretValue,
  maskSecretValue,
} from "@/lib/secret-crypto";

const MAX_INVENTORY_IMPORT_ATTEMPTS = 3;

function isRetryableTransactionConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") {
    return notForAgentsResponse(auth.response);
  }

  const { id } = await params;

  const product = await prisma.catalogProduct.findFirst({
    where: {
      id,
      productType: "API_QUOTA",
    },
    select: { id: true },
  });
  if (!product) {
    return notForAgentsResponse(
      Response.json(
        {
          success: false,
          error: "Catalog product not found",
        },
        { status: 404 }
      )
    );
  }

  const inventory = await prisma.secretInventory.findMany({
    where: {
      productId: id,
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      maskedValue: true,
      status: true,
      createdAt: true,
      soldAt: true,
      importBatch: {
        select: {
          id: true,
          sourceLabel: true,
          note: true,
          importedByUserId: true,
          createdAt: true,
        },
      },
    },
  });

  return notForAgentsResponse(
    Response.json({
      success: true,
      data: {
        productId: id,
        inventory,
      },
    })
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-product-inventory-import",
  });
  if (csrfBlocked) {
    return notForAgentsResponse(csrfBlocked);
  }

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") {
    return notForAgentsResponse(auth.response);
  }

  const { id } = await params;

  try {
    const payload = parseAdminSecretInventoryImportInput(await request.json());
    const product = await prisma.catalogProduct.findFirst({
      where: {
        id,
        productType: "API_QUOTA",
      },
      select: { id: true },
    });
    if (!product) {
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: "Catalog product not found",
          },
          { status: 404 }
        )
      );
    }

    let sawTransactionConflict = false;

    for (
      let attempt = 0;
      attempt < MAX_INVENTORY_IMPORT_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const batch = await prisma.$transaction(
          async (tx) => {
            const existingInventory = await tx.secretInventory.findMany({
              where: {
                productId: id,
              },
              select: {
                encryptedValue: true,
              },
            });
            const existingSecrets = new Set(
              existingInventory.map((row) =>
                decryptSecretValue(row.encryptedValue)
              )
            );
            if (payload.secrets.some((secret) => existingSecrets.has(secret))) {
              throw new AdminSecretProductValidationError(
                "Duplicate secret inventory detected"
              );
            }

            const importBatch = await tx.secretImportBatch.create({
              data: {
                productId: id,
                sourceLabel: payload.sourceLabel,
                note: payload.note,
                importedByUserId: auth.user.id,
                importCount: payload.secrets.length,
              },
            });

            await tx.secretInventory.createMany({
              data: payload.secrets.map((secret) => ({
                productId: id,
                importBatchId: importBatch.id,
                maskedValue: maskSecretValue(secret),
                encryptedValue: encryptSecretValue(secret),
              })),
            });

            return importBatch;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          }
        );

        return notForAgentsResponse(
          Response.json({
            success: true,
            data: {
              importBatchId: batch.id,
              importCount: batch.importCount,
            },
          })
        );
      } catch (error) {
        if (isAdminSecretProductValidationError(error)) {
          throw error;
        }

        if (isRetryableTransactionConflict(error)) {
          sawTransactionConflict = true;
          continue;
        }

        throw error;
      }
    }

    if (sawTransactionConflict) {
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: "Import conflict. Please retry.",
          },
          { status: 409 }
        )
      );
    }

    return notForAgentsResponse(
      Response.json(
        {
          success: false,
          error: "Unable to import inventory",
        },
        { status: 500 }
      )
    );
  } catch (error) {
    if (isAdminSecretProductValidationError(error)) {
      const message =
        error instanceof SyntaxError ? "Invalid request body" : error.message;
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: message,
          },
          { status: 400 }
        )
      );
    }

    console.error("[admin/shop/products/[id]/inventory POST]", error);
    return notForAgentsResponse(
      Response.json(
        {
          success: false,
          error: "Internal server error",
        },
        { status: 500 }
      )
    );
  }
}
