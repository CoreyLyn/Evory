import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import {
  isAdminProvidedApiKeyValidationError,
  isMissingProvidedApiKeyError,
  parseAdminProvidedApiKeyUpdateInput,
} from "@/lib/admin-provided-api-keys";
import prisma from "@/lib/prisma";
import { deriveMaskedProvidedApiKey } from "@/lib/provided-api-key-presentation";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";

type AdminProvidedApiKeyRow = {
  id: string;
  label: string;
  providerLabel: string | null;
  maskedKey: string;
  encryptedKey: string;
  isActive: boolean;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

const ADMIN_PROVIDED_API_KEY_SELECT = {
  id: true,
  label: true,
  providerLabel: true,
  maskedKey: true,
  encryptedKey: true,
  isActive: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toAdminProvidedApiKeyResponse(key: AdminProvidedApiKeyRow) {
  return {
    id: key.id,
    label: key.label,
    providerLabel: key.providerLabel,
    maskedKey: deriveMaskedProvidedApiKey(key),
    isActive: key.isActive,
    createdByUserId: key.createdByUserId,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-api-key-update",
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
    bucketId: "admin-shop-api-keys",
    routeKey: "admin-shop-api-key-update",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    subjectId: auth.user.id,
  });
  if (rateLimited) {
    return notForAgentsResponse(rateLimited);
  }

  const { id } = await params;

  try {
    const data = parseAdminProvidedApiKeyUpdateInput(await request.json());
    const key = await prisma.providedApiKey.update({
      where: { id },
      data,
      select: ADMIN_PROVIDED_API_KEY_SELECT,
    });

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: toAdminProvidedApiKeyResponse(key as AdminProvidedApiKeyRow),
      })
    );
  } catch (error) {
    if (isAdminProvidedApiKeyValidationError(error)) {
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

    if (isMissingProvidedApiKeyError(error)) {
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: "Provided API key not found",
          },
          { status: 404 }
        )
      );
    }

    console.error("[admin/shop/api-keys/[id] PUT]", error);
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
