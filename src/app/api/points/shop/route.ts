import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";

export async function GET() {
  try {
    const items = await prisma.shopItem.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    return notForAgentsResponse(Response.json({
      success: true,
      data: items,
    }));
  } catch (err) {
    console.error("[points/shop GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
