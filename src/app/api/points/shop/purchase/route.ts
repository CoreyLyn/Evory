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
  FulfillmentConflictError,
  fulfillSecretCredentialPurchase,
  InsufficientPointsError as SecretProductInsufficientPointsError,
  OutOfStockError,
  PurchaseLimitExceededError,
  ProductNotFoundError,
} from "@/lib/secret-product-fulfillment";

class InsufficientPointsError extends Error {
  constructor() {
    super("Insufficient points");
    this.name = "InsufficientPointsError";
  }
}

type PurchaseLogLevel = "info" | "warn" | "error";

function logPurchaseEvent(
  level: PurchaseLogLevel,
  event: string,
  details: Record<string, unknown>
) {
  const payload = { event, ...details };
  if (level === "error") {
    console.error("[points/shop/purchase POST]", payload);
    return;
  }
  if (level === "info") {
    console.info("[points/shop/purchase POST]", payload);
    return;
  }
  console.warn("[points/shop/purchase POST]", payload);
}

function isJsonParseError(error: unknown) {
  return error instanceof SyntaxError;
}

function isOwnedItemUniqueViolation(error: unknown) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    (error as { code?: string }).code !== "P2002"
  ) {
    return false;
  }

  const target = "meta" in error
    ? (error as { meta?: { target?: unknown } }).meta?.target
    : undefined;

  return (
    Array.isArray(target) &&
    target.length === 2 &&
    target.includes("agentId") &&
    target.includes("itemId")
  );
}

function readPurchaseRequestBody(body: unknown) {
  const payload =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { itemId?: unknown; productId?: unknown })
      : {};

  return {
    itemId: typeof payload.itemId === "string" ? payload.itemId : null,
    productId: typeof payload.productId === "string" ? payload.productId : null,
  };
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
  let requestedItemId: string | null = null;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (isJsonParseError(error)) {
        return notForAgentsResponse(Response.json(
          { success: false, error: "Request body must be valid JSON" },
          { status: 400 }
        ));
      }

      throw error;
    }

    const { itemId, productId } = readPurchaseRequestBody(body);

    requestedItemId = itemId;

    if (!itemId && !productId) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "itemId or productId is required" },
        { status: 400 }
      ));
    }

    if (itemId && productId) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Provide exactly one of itemId or productId" },
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
          logPurchaseEvent("warn", "secret_purchase_out_of_stock", {
            category: "business",
            agentId: agent.id,
            productId,
          });
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

        if (err instanceof PurchaseLimitExceededError) {
          logPurchaseEvent("warn", "secret_purchase_limit_rejected", {
            category: "business",
            agentId: agent.id,
            productId,
          });
          return notForAgentsResponse(Response.json(
            { success: false, error: err.message },
            { status: 409 }
          ));
        }

        if (err instanceof FulfillmentConflictError) {
          const conflictCode =
            err.code ?? "secret_purchase_retryable_conflict";
          logPurchaseEvent("error", "secret_purchase_conflict_exhausted", {
            category: "platform",
            agentId: agent.id,
            productId,
            code: conflictCode,
          });
          return notForAgentsResponse(Response.json(
            { success: false, error: err.message, code: conflictCode },
            { status: 503 }
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
      logPurchaseEvent("warn", "shop_item_duplicate_rejected", {
        category: "business",
        agentId: agent.id,
        itemId,
      });
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

    if (isOwnedItemUniqueViolation(err)) {
      logPurchaseEvent("warn", "shop_item_duplicate_rejected", {
        category: "business",
        agentId: agent.id,
        itemId: requestedItemId,
      });
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
