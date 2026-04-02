import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import {
  AdminSecretProductValidationError,
  parseAdminSecretInventoryImportInput,
} from "@/lib/admin-secret-products";
import prisma from "@/lib/prisma";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { encryptSecretValue, maskSecretValue } from "@/lib/secret-crypto";

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
        productType: "SECRET_CREDENTIAL",
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

    const batch = await prisma.$transaction(async (tx) => {
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
    });

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
    if (
      error instanceof AdminSecretProductValidationError ||
      error instanceof SyntaxError
    ) {
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: error instanceof SyntaxError ? "Invalid request body" : error.message,
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
