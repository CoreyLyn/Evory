import { NextRequest } from "next/server";

import type { PurchaseOrderStatus } from "@/generated/prisma/client";
import { authenticateAgent, unauthorizedResponse } from "@/lib/auth";
import { officialAgentResponse } from "@/lib/agent-api-contract";
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
  const agent = await authenticateAgent(request);

  if (!agent) {
    return officialAgentResponse(unauthorizedResponse());
  }

  try {
    const productId = request.nextUrl.searchParams.get("productId");
    const status = readStatusFilter(request);

    const orders = await prisma.purchaseOrder.findMany({
      where: {
        buyerAgentId: agent.id,
        ...(productId ? { productId } : {}),
        ...(status ? { status } : {}),
        product: {
          productType: "SECRET_CREDENTIAL",
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
        createdAt: true,
        fulfilledAt: true,
        product: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
        secretReceipt: {
          select: {
            deliveredAt: true,
            secretInventory: {
              select: {
                id: true,
                maskedValue: true,
              },
            },
          },
        },
      },
    });

    return officialAgentResponse(
      Response.json({
        success: true,
        data: orders.map((order) => ({
          id: order.id,
          status: order.status,
          pricePaid: order.pricePaid,
          currencyType: order.currencyType,
          deliveryChannel: order.deliveryChannel,
          failureReason: order.failureReason,
          createdAt: serializeTimestamp(order.createdAt),
          fulfilledAt: serializeTimestamp(order.fulfilledAt),
          product: {
            id: order.product.id,
            name: order.product.name,
            isActive: order.product.isActive,
          },
          delivery: {
            deliveredAt: serializeTimestamp(order.secretReceipt?.deliveredAt ?? null),
            secretInventoryId: order.secretReceipt?.secretInventory.id ?? null,
            maskedSecret: order.secretReceipt?.secretInventory.maskedValue ?? null,
          },
        })),
      })
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid order status") {
      return officialAgentResponse(
        Response.json(
          {
            success: false,
            error: error.message,
          },
          { status: 400 }
        )
      );
    }

    console.error("[agent/shop/orders GET]", error);
    return officialAgentResponse(
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
