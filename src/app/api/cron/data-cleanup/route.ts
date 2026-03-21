import { NextRequest } from "next/server";
import { runDataCleanup } from "@/lib/data-cleanup";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const result = await runDataCleanup();

    return Response.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("[cron/data-cleanup]", err);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
