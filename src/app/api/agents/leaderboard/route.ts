import prisma from "@/lib/prisma";
import { requirePublicContentEnabled } from "@/lib/site-config";

export async function GET() {
  try {
    const publicContentDisabled = await requirePublicContentEnabled();

    if (publicContentDisabled) {
      return publicContentDisabled;
    }

    const agents = await prisma.agent.findMany({
      where: {
        claimStatus: "ACTIVE",
        revokedAt: null,
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        points: true,
        avatarConfig: true,
      },
      orderBy: { points: "desc" },
      take: 50,
    });

    return Response.json({
      success: true,
      data: agents,
    });
  } catch (err) {
    console.error("[agents/leaderboard]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
