import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "haebaek_session";
const SESSION_SECONDS = 12 * 60 * 60;
const REMEMBER_SECONDS = 30 * 24 * 60 * 60;

function encode(value) { return Buffer.from(value).toString("base64url"); }
function sign(value, secret) { return createHmac("sha256", secret).update(value).digest("base64url"); }

export function createSession({ account, remember = false, secret, now = Date.now() }) {
  requireSecret(secret);
  const seconds = remember ? REMEMBER_SECONDS : SESSION_SECONDS;
  const payload = {
    sub: account.id,
    role: account.role,
    ver: account.version,
    sid: randomBytes(18).toString("base64url"),
    csrf: randomBytes(18).toString("base64url"),
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + seconds
  };
  const body = encode(JSON.stringify(payload));
  return { token: `${body}.${sign(body, secret)}`, payload, maxAge: remember ? seconds : null };
}

export function verifySession(token, secret, now = Date.now()) {
  if (typeof token !== "string") return null;
  requireSecret(secret);
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = Buffer.from(sign(parts[0], secret));
  const supplied = Buffer.from(parts[1]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!payload.sub || !payload.sid || !payload.csrf || !Number.isInteger(payload.exp)) return null;
    if (payload.exp <= Math.floor(now / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookie(token, maxAge = null) {
  const fields = [`${COOKIE_NAME}=${token}`, "Path=/", "HttpOnly", "Secure", "SameSite=Strict"];
  if (maxAge !== null) fields.push(`Max-Age=${maxAge}`);
  return fields.join("; ");
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function readCookie(header, name = COOKIE_NAME) {
  for (const entry of String(header || "").split(";")) {
    const index = entry.indexOf("=");
    if (index > 0 && entry.slice(0, index).trim() === name) return entry.slice(index + 1).trim();
  }
  return null;
}

function requireSecret(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("AUTH_SESSION_SECRET 설정이 필요합니다.");
}
