import { NextRequest } from "next/server";

import type { PurchaseOrderStatus } from "@/generated/prisma/client";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import prisma from "@/lib/prisma";

const VALID_ORDER_STATUSES = new Set<PurchaseOrderStatus>([
  "PENDING",
  "FULFILLED",
  "FAILED",
]);

function serializeTimestamp(value: Date | string | null) {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : String(value);
}

function readStatusFilter(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  if (!status) {
    return null;
  }

  if (!VALID_ORDER_STATUSES.has(status as PurchaseOrderStatus)) {
    throw new Error("Invalid order status");
  }

  return status as PurchaseOrderStatus;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") {
    return notForAgentsResponse(auth.response);
  }

  try {
    const productId = request.nextUrl.searchParams.get("productId");
    const buyerAgentId = request.nextUrl.searchParams.get("buyerAgentId");
    const status = readStatusFilter(request);

    const orders = await prisma.purchaseOrder.findMany({
      where: {
        ...(productId ? { productId } : {}),
        ...(buyerAgentId ? { buyerAgentId } : {}),
        ...(status ? { status } : {}),
        product: {
          productType: "API_QUOTA",
        },
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        pricePaid: true,
        currencyType: true,
        deliveryChannel: true,
        failureReason: true,
        quotaAmount: true,
        quotaUnitLabel: true,
        createdAt: true,
        confirmedAt: true,
        fulfilledAt: true,
        product: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
        buyerAgent: {
          select: {
            id: true,
            name: true,
            type: true,
            ownerUserId: true,
          },
        },
        providedApiKey: {
          select: {
            id: true,
            label: true,
            maskedKey: true,
            providerLabel: true,
          },
        },
      },
    });

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: orders.map((order) => ({
          id: order.id,
          status: order.status,
          pricePaid: order.pricePaid,
          currencyType: order.currencyType,
          deliveryChannel: order.deliveryChannel,
          failureReason: order.failureReason,
          quota: {
            amount: order.quotaAmount,
            unit: order.quotaUnitLabel,
          },
          createdAt: serializeTimestamp(order.createdAt),
          confirmedAt: serializeTimestamp(order.confirmedAt),
          fulfilledAt: serializeTimestamp(order.fulfilledAt),
          product: {
            id: order.product.id,
            name: order.product.name,
            isActive: order.product.isActive,
          },
          buyer: {
            agentId: order.buyerAgent.id,
            name: order.buyerAgent.name,
            type: order.buyerAgent.type,
            ownerUserId: order.buyerAgent.ownerUserId,
          },
          providedApiKey: order.providedApiKey
            ? {
                id: order.providedApiKey.id,
                label: order.providedApiKey.label,
                maskedKey: order.providedApiKey.maskedKey,
                providerLabel: order.providedApiKey.providerLabel,
              }
            : null,
        })),
      })
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid order status") {
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: error.message,
          },
          { status: 400 }
        )
      );
    }

    console.error("[admin/shop/orders GET]", error);
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
