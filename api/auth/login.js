import { bodyJson, json, method, requireSameOrigin } from "../_lib/http.mjs";
import { verifyPassword } from "../_lib/password.mjs";
import { createSession, sessionCookie } from "../_lib/session.mjs";
import { readAuthConfig } from "../_lib/store.mjs";

export default async function handler(request, response) {
  if (!method(request, response, "POST")) return;
  try {
    requireSameOrigin(request);
    const { account: accountId, password, remember } = await bodyJson(request);
    if (!new Set(["staff", "admin"]).has(accountId)) return json(response, 401, { error: "계정 또는 비밀번호를 확인해주세요." });
    const config = await readAuthConfig();
    const account = config.accounts[accountId];
    if (!await verifyPassword(password, account.passwordHash)) return json(response, 401, { error: "계정 또는 비밀번호를 확인해주세요." });
    const session = createSession({ account, remember: remember === true, secret: process.env.AUTH_SESSION_SECRET });
    response.setHeader("Set-Cookie", sessionCookie(session.token, session.maxAge));
    json(response, 200, { account: { id: account.id, name: account.name, role: account.role }, redirect: account.role === "ADMIN" ? "/admin" : "/" });
  } catch (error) {
    json(response, error.statusCode || 500, { error: error.statusCode ? error.message : "로그인 설정을 확인해주세요." });
  }
}
