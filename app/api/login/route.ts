import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, SESSION_MAX_AGE, checkPassword, clearFails, isLimited, recordFail, signSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? "unknown";
}

// Relative Location so redirects work behind a reverse proxy regardless of Host.
function go(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (isLimited(ip)) return go("/login?e=limit");

  let password = "";
  try {
    const form = await req.formData();
    const v = form.get("password");
    if (typeof v === "string") password = v.slice(0, 500);
  } catch {
    return go("/login?e=1");
  }

  if (!checkPassword(password)) {
    recordFail(ip);
    return go("/login?e=1");
  }
  clearFails(ip);

  const token = await signSession();
  const https = req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
  const res = go("/");
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: https,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
