import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetScalaSsoReplayForTest, verifyScalaSsoNonce } from "@/server/auth/scala-sso";

const SECRET = "s".repeat(40);
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
function sign(claims: Record<string, unknown>, key = SECRET, header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }) {
  const head = b64(header), body = b64(claims);
  return `${head}.${body}.${createHmac("sha256", key).update(`${head}.${body}`).digest("base64url")}`;
}
const now = Math.floor(Date.now() / 1000);
const good = { iss: "scala-app", aud: "book.get-scala.com", email: "Ale@Get-Scala.com", email_verified: true, uid: "u1", jti: "abcdef123456", iat: now, exp: now + 60 };

describe("verifyScalaSsoNonce", () => {
  beforeEach(() => { vi.stubEnv("BOOKING_SSO_SECRET", SECRET); resetScalaSsoReplayForTest(); });
  it("accepts a valid nonce and normalizes the email", () => { expect(verifyScalaSsoNonce(sign(good))).toEqual({ email: "ale@get-scala.com", jti: "abcdef123456", uid: "u1" }); });
  it("rejects replay of the same jti", () => { const token = sign(good); expect(verifyScalaSsoNonce(token)).not.toBeNull(); expect(verifyScalaSsoNonce(token)).toBeNull(); });
  it("rejects a wrong signature, expired, wrong audience, unverified email and alg none", () => {
    expect(verifyScalaSsoNonce(sign(good, "x".repeat(40)))).toBeNull();
    expect(verifyScalaSsoNonce(sign({ ...good, jti: "j2222222", exp: now - 5 }))).toBeNull();
    expect(verifyScalaSsoNonce(sign({ ...good, jti: "j3333333", aud: "other" }))).toBeNull();
    expect(verifyScalaSsoNonce(sign({ ...good, jti: "j4444444", email_verified: false }))).toBeNull();
    expect(verifyScalaSsoNonce(sign({ ...good, jti: "j5555555" }, SECRET, { alg: "none" }))).toBeNull();
    expect(verifyScalaSsoNonce(sign({ ...good, jti: "j6666666", exp: now + 3600 }))).toBeNull();
  });
  it("is disabled without a strong secret", () => { vi.stubEnv("BOOKING_SSO_SECRET", "short"); expect(verifyScalaSsoNonce(sign(good))).toBeNull(); });
});
