import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import prisma from "@/lib/prisma";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inventoryId: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-secret-inventory-void",
  });
  if (csrfBlocked) {
    return notForAgentsResponse(csrfBlocked);
  }

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") {
    return notForAgentsResponse(auth.response);
  }

  const { inventoryId } = await params;
  const result = await prisma.secretInventory.updateMany({
    where: {
      id: inventoryId,
      status: "AVAILABLE",
    },
    data: {
      status: "VOID",
    },
  });

  if (result.count === 0) {
    return notForAgentsResponse(
      Response.json(
        {
          success: false,
          error: "Available secret inventory not found",
        },
        { status: 404 }
      )
    );
  }

  return notForAgentsResponse(
    Response.json({
      success: true,
    })
  );
}
