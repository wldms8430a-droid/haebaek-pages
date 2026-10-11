import { clearSessionCookie, readCookie, verifySession } from "./session.mjs";
import { readAuthConfig } from "./store.mjs";

export function json(response, status, body, headers = {}) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(JSON.stringify(body));
}

export async function bodyJson(request) {
  if (request.body && typeof request.body === "object") return request.body;
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error("요청이 너무 큽니다.");
  }
  return body ? JSON.parse(body) : {};
}

export function requireSameOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  if (!origin || new URL(origin).host !== host) throw Object.assign(new Error("요청 출처를 확인할 수 없습니다."), { statusCode: 403 });
}

export async function authenticate(request, response, requiredRole = null) {
  const token = readCookie(request.headers.cookie);
  const session = verifySession(token, process.env.AUTH_SESSION_SECRET);
  if (!session) return null;
  const config = await readAuthConfig();
  const account = config.accounts[session.sub];
  if (!account || account.version !== session.ver || account.role !== session.role) {
    response?.setHeader("Set-Cookie", clearSessionCookie());
    return null;
  }
  if (requiredRole && account.role !== requiredRole) return null;
  return { session, account, config };
}

export function requireCsrf(request, session) {
  if (!session || request.headers["x-csrf-token"] !== session.csrf) throw Object.assign(new Error("보안 토큰이 올바르지 않습니다."), { statusCode: 403 });
}

export function method(request, response, allowed) {
  if (request.method === allowed) return true;
  response.setHeader("Allow", allowed);
  json(response, 405, { error: "허용되지 않은 요청 방식입니다." });
  return false;
}
