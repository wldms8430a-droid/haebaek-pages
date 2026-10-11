import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { authenticate } from "./_lib/http.mjs";

const SITE_ROOT = resolve(fileURLToPath(new URL("../site/", import.meta.url)));
const PUBLIC = new Set(["login.html", "assets/auth.css", "assets/auth-client.js"]);
const TYPES = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".png":"image/png", ".webmanifest":"application/manifest+json; charset=utf-8" };

export default async function handler(request, response) {
  if (!new Set(["GET", "HEAD"]).has(request.method)) {
    response.statusCode = 405; response.setHeader("Allow", "GET, HEAD"); return response.end();
  }
  const url = new URL(request.url, `https://${request.headers.host || "localhost"}`);
  let pathname = String(url.searchParams.get("path") || "").replace(/^\/+/, "");
  if (!pathname) pathname = "index.html";
  if (pathname === "login") pathname = "login.html";
  if (pathname === "admin" || pathname === "admin/") pathname = "admin.html";
  if (pathname === "account" || pathname === "account/") pathname = "account.html";
  const isPublicAsset = PUBLIC.has(pathname) || pathname.startsWith("assets/brand/") || pathname.startsWith("assets/icons/");
  let auth = null;
  try { auth = await authenticate(request, response); } catch { return sendText(response, 503, "로그인 설정을 확인해주세요."); }
  if (pathname === "login.html" && auth) return redirect(response, auth.account.role === "ADMIN" ? "/admin" : "/");
  if (!isPublicAsset && !auth) return redirect(response, `/login?next=${encodeURIComponent(request.url?.split("?")[0] || "/")}`);
  if (pathname === "admin.html" && auth?.account.role !== "ADMIN") return sendText(response, 403, "관리자 권한이 필요합니다.");
  const file = resolve(SITE_ROOT, pathname);
  if (file !== SITE_ROOT && !file.startsWith(SITE_ROOT + sep)) return sendText(response, 404, "찾을 수 없습니다.");
  try {
    const details = await stat(file);
    if (!details.isFile()) return sendText(response, 404, "찾을 수 없습니다.");
    response.statusCode = 200;
    response.setHeader("Content-Type", TYPES[extname(file).toLowerCase()] || "application/octet-stream");
    response.setHeader("Cache-Control", isPublicAsset ? "public, max-age=300" : "private, no-cache");
    if (request.method === "HEAD") return response.end();
    if (pathname === "index.html") {
      const html = await readFile(file, "utf8");
      return response.end(html.replace("</head>", "<script src=\"/assets/auth-client.js\" defer></script></head>"));
    }
    createReadStream(file).pipe(response);
  } catch (error) {
    sendText(response, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "찾을 수 없습니다." : "파일을 불러오지 못했습니다.");
  }
}

function redirect(response, location) { response.statusCode = 302; response.setHeader("Location", location); response.setHeader("Cache-Control", "no-store"); response.end(); }
function sendText(response, status, text) { response.statusCode = status; response.setHeader("Content-Type", "text/plain; charset=utf-8"); response.setHeader("Cache-Control", "no-store"); response.end(text); }
