import { NextRequest } from "next/server";

import { withErrorHandler, AppError } from "@/lib/api-utils";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import prisma from "@/lib/prisma";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { authenticateUser } from "@/lib/user-auth";

const MAX_NAME_LENGTH = 100;

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const user = await authenticateUser(request);

  if (!user) {
    throw new AppError(401, "unauthorized", "Unauthorized");
  }

  const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "user-update",
    userId: user.id,
  });

  if (sameOriginRejected) {
    return sameOriginRejected;
  }

  const body = await request.json();

  if (typeof body.name !== "string") {
    throw new AppError(400, "invalid_input", "name must be a string");
  }

  const name = body.name.trim();

  if (name.length > MAX_NAME_LENGTH) {
    throw new AppError(
      400,
      "invalid_input",
      `name must be at most ${MAX_NAME_LENGTH} characters`
    );
  }

  const updated = await (prisma as unknown as {
    user: {
      update: (args: {
        where: { id: string };
        data: { name: string };
        select: { id: true; email: true; name: true; role: true };
      }) => Promise<{ id: string; email: string; name: string; role: string }>;
    };
  }).user.update({
    where: { id: user.id },
    data: { name },
    select: { id: true, email: true, name: true, role: true },
  });

  return notForAgentsResponse(
    Response.json({ success: true, data: updated })
  );
});
