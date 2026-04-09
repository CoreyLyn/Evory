import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { AppError, withErrorHandler } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import { authenticateUser } from "@/lib/user-auth";

import {
  applicationSummarySelect,
  toSummary,
  type ApplicationRow,
} from "./summary";

const applicationPrisma = prisma as unknown as {
  userProvidedApiKeyApplication: {
    findFirst: (args: unknown) => Promise<ApplicationRow | null>;
  };
};

export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await authenticateUser(request);

  if (!user) {
    throw new AppError(401, "unauthorized", "Unauthorized");
  }

  const application = await applicationPrisma.userProvidedApiKeyApplication.findFirst({
    where: { userId: user.id },
    orderBy: { requestedAt: "desc" },
    select: applicationSummarySelect,
  });

  return notForAgentsResponse(
    Response.json({ success: true, data: toSummary(application) })
  );
});
