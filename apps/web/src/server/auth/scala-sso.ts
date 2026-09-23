import { createHmac, timingSafeEqual } from "node:crypto";

const AUDIENCE = "book.get-scala.com";
const ISSUER = "scala-app";
const MAX_LIFETIME_SECONDS = 120;
const usedJti = new Map<string, number>();

export type ScalaSsoClaims = { email: string; jti: string; uid: string };

function secret() {
  const value = process.env.BOOKING_SSO_SECRET || "";
  return Buffer.byteLength(value) >= 32 ? value : null;
}

function decode(part: string) { return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>; }

export function verifyScalaSsoNonce(nonce: string, nowMs = Date.now()): ScalaSsoClaims | null {
  const key = secret();
  const parts = nonce.split(".");
  if (!key || parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  const expected = createHmac("sha256", key).update(`${header}.${payload}`).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    if (decode(header).alg !== "HS256") return null;
    const claims = decode(payload);
    const nowSeconds = Math.floor(nowMs / 1000);
    const exp = Number(claims.exp), iat = Number(claims.iat);
    if (claims.iss !== ISSUER || claims.aud !== AUDIENCE || claims.email_verified !== true) return null;
    if (!Number.isFinite(exp) || !Number.isFinite(iat) || exp <= nowSeconds || exp - iat > MAX_LIFETIME_SECONDS) return null;
    if (typeof claims.email !== "string" || !claims.email.includes("@") || typeof claims.jti !== "string" || claims.jti.length < 8 || typeof claims.uid !== "string") return null;
    for (const [id, expiresAt] of usedJti) if (expiresAt <= nowMs) usedJti.delete(id);
    if (usedJti.has(claims.jti)) return null;
    usedJti.set(claims.jti, exp * 1000);
    return { email: claims.email.trim().toLowerCase(), jti: claims.jti, uid: claims.uid };
  } catch { return null; }
}

export function resetScalaSsoReplayForTest() { usedJti.clear(); }
