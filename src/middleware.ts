import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { applySecurityHeaders } from "@/lib/security-headers";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const kind = request.nextUrl.pathname.startsWith("/api/")
    ? "api"
    : "document";

  return applySecurityHeaders(response, {
    kind,
    isDevelopment: process.env.NODE_ENV !== "production",
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
