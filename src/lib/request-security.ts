import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { getClientIp } from "./rate-limit";

type RequestSecurityPrismaClient = {
  securityEvent?: {
    create: (args: unknown) => Promise<unknown>;
  };
};

type EnforceSameOriginConfig = {
  request: NextRequest;
  routeKey: string;
  userId?: string | null;
};

const requestSecurityPrisma = prisma as unknown as RequestSecurityPrismaClient;

function normalizeOrigin(origin: string | null) {
  if (!origin?.trim()) {
    return null;
  }

  try {
    return new URL(origin).origin;
  } catch {
    return origin.trim();
  }
}

export function getExpectedRequestOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = request.headers.get("host");
  if (host) {
    return `${request.nextUrl.protocol}//${host}`;
  }

  return request.nextUrl.origin;
}

function invalidOriginResponse() {
  return Response.json(
    {
      success: false,
      error: "Invalid request origin",
    },
    {
      status: 403,
    }
  );
}

export async function enforceSameOriginControlPlaneRequest(
  config: EnforceSameOriginConfig
) {
  const method = config.request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return null;
  }

  const origin = normalizeOrigin(config.request.headers.get("origin"));
  const expectedOrigin = normalizeOrigin(getExpectedRequestOrigin(config.request));

  if (origin && expectedOrigin && origin === expectedOrigin) {
    return null;
  }

  // Fallback: when Origin is absent, some browsers/proxies still send Referer
  if (!origin) {
    const referer = config.request.headers.get("referer");
    const refererOrigin = normalizeOrigin(referer);
    if (refererOrigin && expectedOrigin && refererOrigin === expectedOrigin) {
      return null;
    }
  }

  const reason = origin ? "cross-origin" : "missing-origin";

  try {
    await requestSecurityPrisma.securityEvent?.create({
      data: {
        type: "CSRF_REJECTED",
        routeKey: config.routeKey,
        ipAddress: getClientIp(config.request),
        userId: config.userId ?? null,
        metadata: {
          scope: "user",
          severity: "high",
          operation: "same_origin_guard",
          summary:
            "Control-plane mutation request was rejected by same-origin protection.",
          reason,
          origin,
          expectedOrigin,
        },
      },
    });
  } catch (error) {
    console.error("[request-security/same-origin]", error);
  }

  return invalidOriginResponse();
}
