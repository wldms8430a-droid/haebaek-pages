import { authenticate, json, method, requireCsrf, requireSameOrigin } from "../_lib/http.mjs";
import { clearSessionCookie } from "../_lib/session.mjs";

export default async function handler(request, response) {
  if (!method(request, response, "POST")) return;
  try {
    requireSameOrigin(request);
    const auth = await authenticate(request, response);
    if (auth) requireCsrf(request, auth.session);
    response.setHeader("Set-Cookie", clearSessionCookie());
    json(response, 200, { ok: true });
  } catch (error) {
    json(response, error.statusCode || 500, { error: error.message || "로그아웃하지 못했습니다." });
  }
}
