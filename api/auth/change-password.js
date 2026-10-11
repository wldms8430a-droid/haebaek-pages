import { authenticate, bodyJson, json, method, requireCsrf, requireSameOrigin } from "../_lib/http.mjs";
import { hashPassword, validatePassword, verifyPassword } from "../_lib/password.mjs";
import { clearSessionCookie } from "../_lib/session.mjs";
import { writeAuthConfig } from "../_lib/store.mjs";

export default async function handler(request, response) {
  if (!method(request, response, "POST")) return;
  try {
    requireSameOrigin(request);
    const auth = await authenticate(request, response);
    if (!auth) return json(response, 401, { error: "다시 로그인해주세요." });
    requireCsrf(request, auth.session);
    const { current_password: currentPassword, new_password: newPassword } = await bodyJson(request);
    validatePassword(newPassword);
    if (currentPassword === newPassword) return json(response, 400, { error: "새 비밀번호는 현재 비밀번호와 달라야 합니다." });
    if (!await verifyPassword(currentPassword, auth.account.passwordHash)) return json(response, 401, { error: "현재 비밀번호가 올바르지 않습니다." });
    auth.account.passwordHash = await hashPassword(newPassword);
    auth.account.version += 1;
    await writeAuthConfig(auth.config);
    response.setHeader("Set-Cookie", clearSessionCookie());
    json(response, 200, { ok: true, message: "비밀번호가 변경되었습니다. 모든 브라우저에서 다시 로그인해주세요." });
  } catch (error) {
    json(response, error.statusCode || 400, { error: error.message || "비밀번호를 변경하지 못했습니다." });
  }
}
