import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import {
  isAdminProvidedApiKeyValidationError,
  parseAdminProvidedApiKeyInput,
} from "@/lib/admin-provided-api-keys";
import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { encryptSecretValue, maskSecretValue } from "@/lib/secret-crypto";

type AdminProvidedApiKeyListRow = {
  id: string;
  label: string;
  providerLabel: string;
  maskedKey: string;
  isActive: boolean;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    orders: number;
  };
};

type AdminProvidedApiKeyRow = {
  id: string;
  label: string;
  providerLabel: string;
  maskedKey: string;
  isActive: boolean;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

const ADMIN_PROVIDED_API_KEY_BASE_SELECT = {
  id: true,
  label: true,
  providerLabel: true,
  maskedKey: true,
  isActive: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toAdminProvidedApiKeyListResponse(key: AdminProvidedApiKeyListRow) {
  return {
    id: key.id,
    label: key.label,
    providerLabel: key.providerLabel,
    maskedKey: key.maskedKey,
    isActive: key.isActive,
    createdByUserId: key.createdByUserId,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
    orderCount: key._count.orders,
  };
}

function toAdminProvidedApiKeyResponse(key: AdminProvidedApiKeyRow) {
  return {
    id: key.id,
    label: key.label,
    providerLabel: key.providerLabel,
    maskedKey: key.maskedKey,
    isActive: key.isActive,
    createdByUserId: key.createdByUserId,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") {
    return notForAgentsResponse(auth.response);
  }

  const keys = await prisma.providedApiKey.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: {
      ...ADMIN_PROVIDED_API_KEY_BASE_SELECT,
      _count: {
        select: {
          orders: true,
        },
      },
    },
  });

  return notForAgentsResponse(
    Response.json({
      success: true,
      data: keys.map((key) =>
        toAdminProvidedApiKeyListResponse(key as AdminProvidedApiKeyListRow)
      ),
    })
  );
}

export async function POST(request: NextRequest) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-api-keys",
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
    routeKey: "admin-shop-api-keys",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    subjectId: auth.user.id,
  });
  if (rateLimited) {
    return notForAgentsResponse(rateLimited);
  }

  try {
    const input = parseAdminProvidedApiKeyInput(await request.json());
    const key = await prisma.providedApiKey.create({
      data: {
        label: input.label,
        providerLabel: input.providerLabel,
        maskedKey: maskSecretValue(input.apiKey),
        encryptedKey: encryptSecretValue(input.apiKey),
        isActive: input.isActive,
        createdByUserId: auth.user.id,
      },
      select: ADMIN_PROVIDED_API_KEY_BASE_SELECT,
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

    console.error("[admin/shop/api-keys POST]", error);
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
