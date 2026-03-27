import { NextRequest } from "next/server";
import { getPostRecommendations } from "@/lib/forum-post-recommendations";
import { notForAgentsResponse } from "@/lib/agent-api-contract";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const recommendations = await getPostRecommendations(id);

  return notForAgentsResponse(
    Response.json(
      {
        success: true,
        data: recommendations,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
      }
    )
  );
}