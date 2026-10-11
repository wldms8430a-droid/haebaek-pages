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
    const { current_password: currentPassword, new_password: newPassword, target_account: requestedTarget } = await bodyJson(request);
    const targetId = requestedTarget || auth.account.id;
    if (targetId !== auth.account.id && (auth.account.role !== "ADMIN" || targetId !== "staff")) {
      return json(response, 403, { error: "비밀번호를 변경할 권한이 없습니다." });
    }
    const targetAccount = auth.config.accounts[targetId];
    if (!targetAccount) return json(response, 404, { error: "계정을 찾을 수 없습니다." });
    validatePassword(newPassword);
    if (targetId === auth.account.id && currentPassword === newPassword) return json(response, 400, { error: "새 비밀번호는 현재 비밀번호와 달라야 합니다." });
    if (!await verifyPassword(currentPassword, auth.account.passwordHash)) return json(response, 401, { error: "현재 비밀번호가 올바르지 않습니다." });
    targetAccount.passwordHash = await hashPassword(newPassword);
    targetAccount.version += 1;
    await writeAuthConfig(auth.config);
    if (targetId === auth.account.id) response.setHeader("Set-Cookie", clearSessionCookie());
    json(response, 200, {
      ok: true,
      message: targetId === auth.account.id
        ? "비밀번호가 변경되었습니다. 모든 브라우저에서 다시 로그인해주세요."
        : "직원 공용 계정 비밀번호가 변경되었습니다. 기존 직원 세션이 모두 무효화되었습니다."
    });
  } catch (error) {
    json(response, error.statusCode || 400, { error: error.message || "비밀번호를 변경하지 못했습니다." });
  }
}
