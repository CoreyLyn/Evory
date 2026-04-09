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
import { Prisma, PointActionType } from "@/generated/prisma/client";
import { deductPoints } from "@/lib/points";

class InsufficientPointsError extends Error {
  constructor() {
    super("Insufficient points");
    this.name = "InsufficientPointsError";
  }
}

type PurchaseLogLevel = "info" | "warn" | "error";
const MAX_API_QUOTA_PURCHASE_ATTEMPTS = 3;

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

type ApiQuotaProductConfig = {
  quotaAmount: number;
  quotaUnitLabel: string;
  allowRepeatPurchase: boolean;
  perAgentPurchaseLimit: number | null;
};

class PurchaseLimitExceededError extends Error {
  constructor() {
    super("Product purchase limit reached");
    this.name = "PurchaseLimitExceededError";
  }
}

function isRetryableTransactionConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}

function readApiQuotaProductConfig(
  fulfillmentConfig: unknown,
  displayConfig: unknown
): ApiQuotaProductConfig {
  const fulfillment =
    fulfillmentConfig &&
    typeof fulfillmentConfig === "object" &&
    !Array.isArray(fulfillmentConfig)
      ? (fulfillmentConfig as Record<string, unknown>)
      : null;
  const display =
    displayConfig && typeof displayConfig === "object" && !Array.isArray(displayConfig)
      ? (displayConfig as Record<string, unknown>)
      : null;

  const quotaAmount =
    typeof fulfillment?.quotaAmount === "number" &&
    Number.isInteger(fulfillment.quotaAmount) &&
    fulfillment.quotaAmount > 0
      ? fulfillment.quotaAmount
      : null;

  if (!quotaAmount) {
    throw new Error("Product quota configuration is invalid");
  }

  const quotaUnitLabel =
    typeof display?.quotaUnitLabel === "string" && display.quotaUnitLabel.trim()
      ? display.quotaUnitLabel.trim()
      : "tokens";

  const allowRepeatPurchase =
    typeof fulfillment?.allowRepeatPurchase === "boolean"
      ? fulfillment.allowRepeatPurchase
      : true;
  const perAgentPurchaseLimit =
    typeof fulfillment?.perAgentPurchaseLimit === "number" &&
    Number.isInteger(fulfillment.perAgentPurchaseLimit) &&
    fulfillment.perAgentPurchaseLimit > 0
      ? fulfillment.perAgentPurchaseLimit
      : null;

  return {
    quotaAmount,
    quotaUnitLabel,
    allowRepeatPurchase,
    perAgentPurchaseLimit,
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
      const product = await prisma.catalogProduct.findUnique({
        where: { id: productId },
      });

      if (!product || !product.isActive || product.productType !== "API_QUOTA") {
        return notForAgentsResponse(Response.json(
          { success: false, error: "Product not found" },
          { status: 404 }
        ));
      }

      const quotaConfig = readApiQuotaProductConfig(
        product.fulfillmentConfig,
        product.displayConfig
      );

      try {
        let order: Awaited<ReturnType<typeof prisma.purchaseOrder.create>> | null = null;

        for (let attempt = 0; attempt < MAX_API_QUOTA_PURCHASE_ATTEMPTS; attempt += 1) {
          try {
            order = await prisma.$transaction(
              async (tx) => {
                const qualifyingOrderCount = await tx.purchaseOrder.count({
                  where: {
                    buyerAgentId: agent.id,
                    productId: product.id,
                    status: { in: ["PENDING", "FULFILLED"] },
                  },
                });

                if (!quotaConfig.allowRepeatPurchase && qualifyingOrderCount >= 1) {
                  throw new PurchaseLimitExceededError();
                }
                if (
                  quotaConfig.perAgentPurchaseLimit !== null &&
                  qualifyingOrderCount >= quotaConfig.perAgentPurchaseLimit
                ) {
                  throw new PurchaseLimitExceededError();
                }

                const deducted = await deductPoints(
                  agent.id,
                  product.price,
                  PointActionType.SHOP_PURCHASE,
                  product.id,
                  `Purchased: ${product.name}`,
                  tx
                );

                if (!deducted) {
                  throw new InsufficientPointsError();
                }

                return tx.purchaseOrder.create({
                  data: {
                    buyerAgentId: agent.id,
                    productId: product.id,
                    pricePaid: product.price,
                    currencyType: product.currencyType,
                    status: "PENDING",
                    deliveryChannel: "AGENT_CHAT",
                    quotaAmount: quotaConfig.quotaAmount,
                    quotaUnitLabel: quotaConfig.quotaUnitLabel,
                  },
                });
              },
              {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              }
            );
            break;
          } catch (error) {
            if (isRetryableTransactionConflict(error)) {
              if (attempt === MAX_API_QUOTA_PURCHASE_ATTEMPTS - 1) {
                throw error;
              }
              continue;
            }

            throw error;
          }
        }

        if (!order) {
          throw new Error("Purchase order was not created");
        }

        return notForAgentsResponse(Response.json({
          success: true,
          data: {
            orderId: order.id,
            id: order.id,
            status: order.status,
            product: {
              id: product.id,
              name: product.name,
              description: product.description,
            },
            pricePaid: order.pricePaid,
            currencyType: order.currencyType,
            deliveryChannel: order.deliveryChannel,
            quota: {
              amount: order.quotaAmount,
              unit: order.quotaUnitLabel,
            },
            createdAt: order.createdAt,
            message: "Order created. An admin must confirm the API quota fulfillment.",
          },
        }));
      } catch (err) {
        if (err instanceof PurchaseLimitExceededError) {
          logPurchaseEvent("warn", "api_quota_purchase_limit_rejected", {
            category: "business",
            agentId: agent.id,
            productId,
          });
          return notForAgentsResponse(Response.json(
            { success: false, error: err.message },
            { status: 409 }
          ));
        }

        if (isRetryableTransactionConflict(err)) {
          const conflictCode = "api_quota_purchase_retryable_conflict";
          logPurchaseEvent("error", "api_quota_purchase_conflict_exhausted", {
            category: "platform",
            agentId: agent.id,
            productId,
            code: conflictCode,
          });
          return notForAgentsResponse(Response.json(
            {
              success: false,
              error: "Purchase is temporarily unavailable, please retry",
              code: conflictCode,
            },
            { status: 503 }
          ));
        }

        if (err instanceof InsufficientPointsError) {
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
