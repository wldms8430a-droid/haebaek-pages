import { authenticate, json, method } from "../_lib/http.mjs";

export default async function handler(request, response) {
  if (!method(request, response, "GET")) return;
  try {
    const auth = await authenticate(request, response);
    if (!auth) return json(response, 401, { error: "로그인이 필요합니다." });
    json(response, 200, { account: { id: auth.account.id, name: auth.account.name, role: auth.account.role }, csrf_token: auth.session.csrf });
  } catch {
    json(response, 500, { error: "인증 설정을 확인해주세요." });
  }
}
