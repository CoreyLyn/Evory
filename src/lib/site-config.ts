import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import {
  authenticateUser,
  authenticateUserSessionToken,
  USER_SESSION_COOKIE_NAME,
} from "@/lib/user-auth";

export const DEFAULT_SITE_CONFIG = {
  registrationEnabled: true,
  publicContentEnabled: true,
} as const;

type SiteConfigRecord = {
  id: string;
  registrationEnabled: boolean;
  publicContentEnabled: boolean;
};

type SiteConfigPrismaClient = {
  siteConfig?: {
    findFirst: (args?: unknown) => Promise<SiteConfigRecord | null>;
    upsert: (args: unknown) => Promise<SiteConfigRecord>;
  };
  userSession?: {
    findUnique: (args: unknown) => Promise<{
      expiresAt: Date | string;
      user?: {
        id: string;
        email: string;
        name?: string | null;
        role: string;
      } | null;
    } | null>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
};

const siteConfigPrisma = prisma as unknown as SiteConfigPrismaClient;

export async function getSiteConfig(
  prismaClient: SiteConfigPrismaClient = siteConfigPrisma
) {
  const row = await prismaClient.siteConfig?.findFirst();

  if (!row) {
    return DEFAULT_SITE_CONFIG;
  }

  return {
    registrationEnabled: row.registrationEnabled,
    publicContentEnabled: row.publicContentEnabled,
  };
}

export async function upsertSiteConfig(
  prismaClient: SiteConfigPrismaClient = siteConfigPrisma,
  input: {
    registrationEnabled: boolean;
    publicContentEnabled: boolean;
  }
) {
  const existing = await prismaClient.siteConfig?.findFirst({
    select: { id: true },
  });

  if (!prismaClient.siteConfig?.upsert) {
    throw new Error("SiteConfig client is not available");
  }

  return prismaClient.siteConfig.upsert({
    where: { id: existing?.id ?? "site-config-singleton" },
    create: {
      id: existing?.id ?? "site-config-singleton",
      ...input,
    },
    update: input,
  });
}

export async function requireRegistrationEnabled(
  prismaClient: SiteConfigPrismaClient = siteConfigPrisma
) {
  const config = await getSiteConfig(prismaClient);

  if (config.registrationEnabled) {
    return null;
  }

  return Response.json(
    {
      success: false,
      error: "Registration is currently closed",
      code: "REGISTRATION_DISABLED",
    },
    { status: 403 }
  );
}

export async function requirePublicContentEnabled(
  request?: NextRequest,
  prismaClient: SiteConfigPrismaClient = siteConfigPrisma
) {
  const config = await getSiteConfig(prismaClient);

  if (
    config.publicContentEnabled ||
    (await getViewerRole({ request, prismaClient })) === "ADMIN"
  ) {
    return null;
  }

  return Response.json(
    {
      success: false,
      error: "Public content is currently unavailable",
      code: "PUBLIC_CONTENT_DISABLED",
    },
    { status: 403 }
  );
}

export async function getViewerRole({
  request,
  viewerRole,
  prismaClient = siteConfigPrisma,
}: {
  request?: NextRequest;
  viewerRole?: string | null;
  prismaClient?: SiteConfigPrismaClient;
} = {}) {
  if (viewerRole !== undefined) {
    return viewerRole;
  }

  if (request) {
    const user = await authenticateUser(request, prismaClient as never);
    return user?.role ?? null;
  }

  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const token = cookieStore.get(USER_SESSION_COOKIE_NAME)?.value;
    const user = await authenticateUserSessionToken(token, prismaClient as never);
    return user?.role ?? null;
  } catch {
    return null;
  }
}

export async function canAccessPublicContent({
  viewerRole,
  prismaClient = siteConfigPrisma,
}: {
  viewerRole?: string | null;
  prismaClient?: SiteConfigPrismaClient;
} = {}) {
  const config = await getSiteConfig(prismaClient);

  if (config.publicContentEnabled) {
    return true;
  }

  return (await getViewerRole({ viewerRole, prismaClient })) === "ADMIN";
}
