import { NextResponse, type NextRequest } from "next/server";
import { requestId } from "@/server/observability";

const CORS_ALLOWED_ORIGINS = new Set(["https://get-scala.com", "https://app.get-scala.com"]);

export function proxy(request: NextRequest) {
  const id = requestId(request.headers.get("x-request-id")); const headers = new Headers(request.headers); headers.set("x-request-id", id);

  if (request.nextUrl.pathname.startsWith("/api/public/")) {
    const origin = request.headers.get("origin");
    const allowOrigin = origin && CORS_ALLOWED_ORIGINS.has(origin) ? origin : null;
    if (request.method === "OPTIONS") {
      const preflightHeaders = new Headers({ "x-request-id": id });
      if (allowOrigin) {
        preflightHeaders.set("Access-Control-Allow-Origin", allowOrigin);
        preflightHeaders.set("Vary", "Origin");
        preflightHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        preflightHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        preflightHeaders.set("Access-Control-Max-Age", "86400");
      }
      return new NextResponse(null, { status: 204, headers: preflightHeaders });
    }
    const response = NextResponse.next({ request: { headers } }); response.headers.set("x-request-id", id);
    if (allowOrigin) { response.headers.set("Access-Control-Allow-Origin", allowOrigin); response.headers.set("Vary", "Origin"); }
    return response;
  }

  const response = NextResponse.next({ request: { headers } }); response.headers.set("x-request-id", id); return response;
}
export const config = { matcher: ["/api/:path*"] };
