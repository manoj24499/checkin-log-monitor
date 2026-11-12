import { SignJWT, jwtVerify } from "jose";
import { timingSafeEqual, createHash } from "node:crypto";

export const COOKIE = "monitor_session";
export const SESSION_MAX_AGE = 12 * 60 * 60;

function secret(): Uint8Array {
  const s = process.env.MONITOR_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("MONITOR_SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function signSession(): Promise<string> {
  return new SignJWT({ sub: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.sub === "admin";
  } catch {
    return false;
  }
}

export function checkPassword(input: string): boolean {
  const expected = process.env.MONITOR_PASSWORD;
  if (!expected) return false;
  // Hash both so lengths match for timingSafeEqual.
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// --- in-memory login rate limit: 5 failures / 10 min / IP ---
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;
const fails = new Map<string, number[]>();

function recent(ip: string): number[] {
  const now = Date.now();
  const arr = (fails.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length) fails.set(ip, arr);
  else fails.delete(ip);
  return arr;
}
export function isLimited(ip: string): boolean {
  return recent(ip).length >= MAX_FAILS;
}
export function recordFail(ip: string): void {
  const arr = recent(ip);
  arr.push(Date.now());
  fails.set(ip, arr);
  if (fails.size > 5000) fails.clear();
}
export function clearFails(ip: string): void {
  fails.delete(ip);
}
