import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { createSessionForUser, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";
import { verifyScalaSsoNonce } from "@/server/auth/scala-sso";
import { clientAddress, enforceRateLimit } from "@/server/rate-limit";
import { enterAuthDatabaseContext } from "@/server/db-context";
import { AppError } from "@/server/errors";

const NEXT_ALLOWLIST = new Set(["/dashboard", "/bookings", "/event-types", "/availability", "/integrations", "/settings"]);
const rank = (role: string) => (role === "OWNER" ? 3 : role === "ADMIN" ? 2 : 1);

function redirect(location: string) {
  const response = new NextResponse(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("next") || "/dashboard";
  const next = NEXT_ALLOWLIST.has(requested) ? requested : "/dashboard";
  try {
    await enforceRateLimit(`login:ip:${clientAddress(request)}`, 12, 15 * 60_000);
    const claims = verifyScalaSsoNonce(url.searchParams.get("nonce") || "");
    if (!claims) return redirect("/dashboard");
    enterAuthDatabaseContext(claims.email);
    const user = await db.user.findUnique({ where: { email: claims.email }, include: { memberships: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } } } });
    const membership = user?.memberships.sort((a, b) => rank(b.role) - rank(a.role))[0];
    if (!user || !membership || !user.emailVerifiedAt) return redirect("/signup?from=scala");
    enterAuthDatabaseContext(claims.email, user.id, membership.workspaceId);
    const response = redirect(next);
    response.cookies.set(SESSION_COOKIE, await createSessionForUser(user.id, membership.id, false), sessionCookieOptions);
    return response;
  } catch (error) {
    if (!(error instanceof AppError)) console.error("SSO exchange failed", { name: error instanceof Error ? error.name : "unknown" });
    return redirect("/dashboard");
  }
}
