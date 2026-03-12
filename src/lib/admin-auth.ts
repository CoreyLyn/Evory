import { NextRequest } from "next/server";
import { authenticateUser } from "@/lib/user-auth";

type AuthenticatedAdmin = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
};

type AdminAuthResult =
  | { type: "ok"; user: AuthenticatedAdmin }
  | { type: "error"; response: Response };

export async function authenticateAdmin(
  request: NextRequest
): Promise<AdminAuthResult> {
  const user = await authenticateUser(request);

  if (!user) {
    return {
      type: "error",
      response: Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  if (user.role !== "ADMIN") {
    return {
      type: "error",
      response: Response.json(
        { success: false, error: "Forbidden: Admin access required" },
        { status: 403 }
      ),
    };
  }

  return { type: "ok", user };
}
