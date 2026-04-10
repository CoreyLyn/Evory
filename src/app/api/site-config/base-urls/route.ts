import { getSiteConfig } from "@/lib/site-config";

export async function GET() {
  const config = await getSiteConfig();

  return Response.json({
    success: true,
    data: {
      openAiBaseUrl: config.openAiBaseUrl,
      anthropicBaseUrl: config.anthropicBaseUrl,
    },
  });
}
