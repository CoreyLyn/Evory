import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import {
  AdminSecretProductValidationError,
  parseAdminSecretProductInput,
} from "@/lib/admin-secret-products";
import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";

function isMissingCatalogProductError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "P2025"
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-product-update",
  });
  if (csrfBlocked) {
    return notForAgentsResponse(csrfBlocked);
  }

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") {
    return notForAgentsResponse(auth.response);
  }

  const rateLimited = await enforceRateLimit({
    request,
    bucketId: "admin-shop-products",
    routeKey: "admin-shop-product-update",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    subjectId: auth.user.id,
  });
  if (rateLimited) {
    return notForAgentsResponse(rateLimited);
  }

  const { id } = await params;

  try {
    const data = parseAdminSecretProductInput(await request.json());
    const product = await prisma.catalogProduct.update({
      where: { id },
      data,
    });

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: product,
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
            error:
              error instanceof SyntaxError ? "Invalid request body" : error.message,
          },
          { status: 400 }
        )
      );
    }

    if (isMissingCatalogProductError(error)) {
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

    console.error("[admin/shop/products/[id] PUT]", error);
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
