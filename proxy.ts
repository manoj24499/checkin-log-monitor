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
  // Relative Location so it works behind a reverse proxy.
  return new NextResponse(null, { status: 307, headers: { Location: "/login" } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
