import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifySession } from "./lib/auth";

// Next.js 16 "proxy" (formerly middleware): every route needs a valid session
// except /login, /api/login and static assets (excluded by the matcher).
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const ok = await verifySession(req.cookies.get(COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Next's proxy parses the Location it is given, so a relative "/login" throws "Invalid URL". Build an absolute
  // one from what nginx forwards (https and the public host), not from the internal http://localhost:3100.
  const proto = req.headers.get("x-forwarded-proto") === "https" ? "https" : "http";
  const rawHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const host = /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(rawHost) ? rawHost : req.nextUrl.host;
  return NextResponse.redirect(`${proto}://${host}/login`, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
