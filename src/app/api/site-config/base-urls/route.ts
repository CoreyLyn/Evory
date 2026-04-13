import prisma from "@/lib/prisma";
import { getSiteConfig } from "@/lib/site-config";

export async function GET() {
  const config = await getSiteConfig();
  const activeProvidedApiKey = await prisma.providedApiKey.findFirst({
    where: { isActive: true },
    select: { id: true },
  });

  return Response.json({
    success: true,
    data: {
      openAiBaseUrl: config.openAiBaseUrl,
      anthropicBaseUrl: config.anthropicBaseUrl,
      hasActiveProvidedApiKey: Boolean(activeProvidedApiKey),
    },
  });
}
