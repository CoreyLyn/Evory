import prisma from "@/lib/prisma";

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
  prismaClient: SiteConfigPrismaClient = siteConfigPrisma
) {
  const config = await getSiteConfig(prismaClient);

  if (config.publicContentEnabled) {
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
