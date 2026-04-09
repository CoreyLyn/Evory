import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import prisma from "@/lib/prisma";

type AdminApiKeyApplicationRow = {
  id: string;
  status: "PENDING" | "FULFILLED" | "FAILED";
  requestedAt: Date;
  fulfilledAt: Date | null;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  providedApiKey: {
    id: string;
    maskedKey: string;
    isActive: boolean;
  } | null;
};

const ADMIN_API_KEY_APPLICATION_SELECT = {
  id: true,
  status: true,
  requestedAt: true,
  fulfilledAt: true,
  user: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  providedApiKey: {
    select: {
      id: true,
      maskedKey: true,
      isActive: true,
    },
  },
} as const;

function toAdminApiKeyApplicationResponse(application: AdminApiKeyApplicationRow) {
  return {
    id: application.id,
    status: application.status,
    requestedAt: application.requestedAt.toISOString(),
    fulfilledAt: application.fulfilledAt?.toISOString() ?? null,
    user: {
      id: application.user.id,
      email: application.user.email,
      name: application.user.name,
    },
    providedApiKey: application.providedApiKey
      ? {
          id: application.providedApiKey.id,
          maskedKey: application.providedApiKey.maskedKey,
          isActive: application.providedApiKey.isActive,
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") {
    return notForAgentsResponse(auth.response);
  }

  const applications = await prisma.userProvidedApiKeyApplication.findMany({
    where: {
      status: "FULFILLED",
      providedApiKeyId: { not: null },
    },
    orderBy: [{ fulfilledAt: "desc" }, { requestedAt: "desc" }],
    select: ADMIN_API_KEY_APPLICATION_SELECT,
  });

  return notForAgentsResponse(
    Response.json({
      success: true,
      data: applications.map((application) =>
        toAdminApiKeyApplicationResponse(
          application as AdminApiKeyApplicationRow
        )
      ),
    })
  );
}
