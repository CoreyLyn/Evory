import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  try {
    const items = await prisma.shopItem.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    return Response.json({
      success: true,
      data: items,
    });
  } catch (err) {
    console.error("[points/shop GET]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
