import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { AppError, withErrorHandler } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { authenticateUser } from "@/lib/user-auth";
import { Prisma } from "@/generated/prisma/client";

import {
  applicationSummarySelect,
  toSummary,
  type ApplicationRow,
} from "../summary";

const applicationPrisma = prisma as unknown as {
  userProvidedApiKeyApplication: {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<ApplicationRow>;
  };
  $transaction: <T>(
    input: (tx: {
      userProvidedApiKeyApplication: {
        findFirst: (args: unknown) => Promise<{ id: string } | null>;
        create: (args: unknown) => Promise<ApplicationRow>;
      };
    }) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel }
  ) => Promise<T>;
};

function isRetryableTransactionConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await authenticateUser(request);

  if (!user) {
    throw new AppError(401, "unauthorized", "Unauthorized");
  }

  const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "user-provided-api-key-application-create",
    userId: user.id,
  });

  if (sameOriginRejected) {
    return sameOriginRejected;
  }

  const maxAttempts = 3;
  let sawTransactionConflict = false;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const application = await applicationPrisma.$transaction(
        async (tx) => {
          const existing = await tx.userProvidedApiKeyApplication.findFirst({
            where: {
              userId: user.id,
              status: { in: ["PENDING", "FULFILLED"] },
            },
            select: { id: true },
          });

          if (existing) {
            throw new AppError(
              409,
              "duplicate_application",
              "Pending application already exists"
            );
          }

          return tx.userProvidedApiKeyApplication.create({
            data: { userId: user.id },
            select: applicationSummarySelect,
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      );

      return notForAgentsResponse(
        Response.json({ success: true, data: toSummary(application) })
      );
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (isRetryableTransactionConflict(error)) {
        sawTransactionConflict = true;
        continue;
      }
      throw error;
    }
  }

  if (sawTransactionConflict) {
    return notForAgentsResponse(
      Response.json(
        { success: false, error: "Request conflict. Please retry." },
        { status: 409 }
      )
    );
  }

  return notForAgentsResponse(
    Response.json(
      { success: false, error: "Unable to create application" },
      { status: 500 }
    )
  );
});
