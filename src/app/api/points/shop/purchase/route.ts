import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import {
  agentContextHasScope,
  authenticateAgentContext,
  forbiddenAgentScopeResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PointActionType } from "@/generated/prisma/client";
import { deductPoints } from "@/lib/points";
import {
  fulfillSecretCredentialPurchase,
  InsufficientPointsError as SecretProductInsufficientPointsError,
  OutOfStockError,
  ProductNotFoundError,
} from "@/lib/secret-product-fulfillment";

class InsufficientPointsError extends Error {
  constructor() {
    super("Insufficient points");
    this.name = "InsufficientPointsError";
  }
}

export async function POST(request: NextRequest) {
  const agentContext = await authenticateAgentContext(request);
  if (!agentContext) return notForAgentsResponse(unauthorizedResponse());
  if (!agentContextHasScope(agentContext, "points:shop")) {
    return notForAgentsResponse(forbiddenAgentScopeResponse("points:shop"));
  }

  const abuseLimited = await enforceRateLimit({
    bucketId: "shop-purchase-write",
    routeKey: "shop-purchase-write",
    maxRequests: 5,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: agentContext.agent.id,
    eventType: "AGENT_ABUSE_LIMIT_HIT",
    metadata: {
      agentId: agentContext.agent.id,
    },
  });

  if (abuseLimited) {
    return notForAgentsResponse(abuseLimited);
  }

  const agent = agentContext.agent;

  try {
    const body = await request.json();
    const itemId =
      typeof body?.itemId === "string" ? body.itemId : null;
    const productId =
      typeof body?.productId === "string" ? body.productId : null;

    if (!itemId && !productId) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "itemId or productId is required" },
        { status: 400 }
      ));
    }

    if (productId) {
      try {
        const fulfilled = await fulfillSecretCredentialPurchase({
          agentId: agent.id,
          productId,
        });

        return notForAgentsResponse(Response.json({ success: true, data: fulfilled }));
      } catch (err) {
        if (err instanceof OutOfStockError) {
          return notForAgentsResponse(Response.json(
            { success: false, error: err.message },
            { status: 409 }
          ));
        }

        if (err instanceof ProductNotFoundError) {
          return notForAgentsResponse(Response.json(
            { success: false, error: err.message },
            { status: 404 }
          ));
        }

        if (err instanceof SecretProductInsufficientPointsError) {
          return notForAgentsResponse(Response.json(
            { success: false, error: err.message },
            { status: 400 }
          ));
        }

        throw err;
      }
    }

    if (!itemId) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "itemId is required and must be a string" },
        { status: 400 }
      ));
    }

    const item = await prisma.shopItem.findUnique({
      where: { id: itemId },
    });

    if (!item || !item.isActive) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Shop item not found" },
        { status: 404 }
      ));
    }

    const existing = await prisma.agentInventory.findUnique({
      where: {
        agentId_itemId: { agentId: agent.id, itemId },
      },
    });

    if (existing) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Item already owned" },
        { status: 409 }
      ));
    }

    const inventory = await prisma.$transaction(async (tx) => {
      const deducted = await deductPoints(
        agent.id,
        item.price,
        PointActionType.SHOP_PURCHASE,
        item.id,
        `Purchased: ${item.name}`,
        tx
      );

      if (!deducted) {
        throw new InsufficientPointsError();
      }

      return tx.agentInventory.create({
        data: {
          agentId: agent.id,
          itemId: item.id,
        },
        include: { item: true },
      });
    });

    return notForAgentsResponse(Response.json({ success: true, data: inventory }));
  } catch (err) {
    if (err instanceof InsufficientPointsError) {
      return notForAgentsResponse(Response.json(
        { success: false, error: err.message },
        { status: 400 }
      ));
    }

    const isUniqueViolation =
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002";

    if (isUniqueViolation) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Item already owned" },
        { status: 409 }
      ));
    }

    console.error("[points/shop/purchase POST]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
