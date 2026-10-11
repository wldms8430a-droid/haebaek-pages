import { randomBytes } from "node:crypto";
import { cp, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = process.argv[2];
if (!cli) throw new Error("Vercel CLI 경로가 필요합니다.");

const password = () => `${randomBytes(18).toString("base64url")}!A7`;
const initial = { staff: password(), admin: password() };
const final = { staff: password(), admin: password() };
while (final.staff === final.admin) final.admin = password();
const sessionSecret = randomBytes(48).toString("base64url");
const storeKey = `auth/preview-${randomBytes(12).toString("hex")}.json`;

function run(command, args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`명령 실패 (${code}): ${stderr.replaceAll(initial.staff,"[redacted]").replaceAll(initial.admin,"[redacted]").replaceAll(final.staff,"[redacted]").replaceAll(final.admin,"[redacted]")}`)));
    child.stdin.end(input);
  });
}

async function addEnv(name, value) {
  await run(process.execPath, [cli,"env","add",name,"preview","--sensitive","--force","--yes","--no-color"], `${value}\n`);
}

const hashResult = await run(process.execPath, [join(root,"tools","hash_passwords_stdin.mjs")], JSON.stringify([initial.staff, initial.admin]));
const [staffHash, adminHash] = JSON.parse(hashResult.stdout);
await addEnv("AUTH_SESSION_SECRET", sessionSecret);
await addEnv("AUTH_STAFF_PASSWORD_HASH", staffHash);
await addEnv("AUTH_ADMIN_PASSWORD_HASH", adminHash);
await addEnv("AUTH_STORE_KEY", storeKey);

const stageRoot = join(root,"local","vercel-preview-stage");
const stageProject = join(stageRoot,"site");
await rm(stageRoot,{recursive:true,force:true});
await mkdir(stageProject,{recursive:true});
await cp(join(root,"api"),join(stageProject,"api"),{recursive:true});
await cp(join(root,"site"),join(stageProject,"site"),{recursive:true});
for (const file of ["package.json","pnpm-lock.yaml","vercel.json"]) await copyFile(join(root,file),join(stageProject,file));

const deploymentResult = await run(process.execPath, [cli,"deploy",stageRoot,"--project","haebaek-pages-site","--target","preview","--force","--yes","--json","--no-color"]);
const deploymentJson = JSON.parse(deploymentResult.stdout.slice(deploymentResult.stdout.indexOf("{")));
function findDeploymentUrl(value) {
  if (typeof value === "string" && /(?:^https:\/\/|^)[a-z0-9-]+\.vercel\.app$/i.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findDeploymentUrl(item); if (found) return found; }
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) { const found = findDeploymentUrl(item); if (found) return found; }
  }
  return "";
}
const rawDeploymentUrl = findDeploymentUrl(deploymentJson);
if (!rawDeploymentUrl) throw new Error("Preview 배포 URL을 확인하지 못했습니다.");
const deploymentUrl = rawDeploymentUrl.startsWith("http") ? rawDeploymentUrl : `https://${rawDeploymentUrl}`;
const origin = new URL(deploymentUrl).origin;
const work = await mkdtemp(join(tmpdir(),"haebaek-preview-test-"));

async function request(path, { method="GET", body=null, jar="anonymous", csrf="" }={}) {
  const jarPath = join(work, `${jar}.cookies`);
  const args = ["curl",path,"--deployment",deploymentUrl,"--","--silent","--show-error","--cookie-jar",jarPath,"--cookie",jarPath,"--header",`Origin: ${origin}`,"--write-out=__STATUS__%{http_code}"];
  if (body !== null) args.push("--header","Content-Type: application/json","--request",method,"--data-binary","@-");
  else if (method !== "GET") args.push("--request",method);
  if (csrf) args.push("--header",`X-CSRF-Token: ${csrf}`);
  const result = await run(process.execPath,[cli,...args],body === null ? "" : JSON.stringify(body));
  const marker = result.stdout.lastIndexOf("__STATUS__");
  if (marker < 0) throw new Error("HTTP 상태코드를 확인하지 못했습니다.");
  const status = Number(result.stdout.slice(marker + 10).trim());
  return { status, body: result.stdout.slice(0, marker) };
}

function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: HTTP ${actual}, 예상 ${expected}`);
}

try {
  expect((await request("/data/slides.json")).status,302,"비로그인 PPT 데이터 차단");
  expect((await request("/api/auth/login",{method:"POST",jar:"staff-old",body:{account:"staff",password:initial.staff,remember:true}})).status,200,"직원 로그인");
  expect((await request("/admin",{jar:"staff-old"})).status,403,"직원 관리자 화면 차단");
  expect((await request("/",{jar:"staff-old"})).status,200,"로그인 후 기존 챗봇 화면");
  expect((await request("/data/slides.json",{jar:"staff-old"})).status,200,"로그인 후 PPT 데이터");
  expect((await request("/api/auth/login",{method:"POST",jar:"admin-old",body:{account:"admin",password:initial.admin}})).status,200,"관리자 로그인");
  expect((await request("/admin",{jar:"admin-old"})).status,200,"관리자 화면 접근");
  const adminMe = await request("/api/auth/me",{jar:"admin-old"});
  expect(adminMe.status,200,"관리자 세션 확인");
  const csrf = JSON.parse(adminMe.body).csrf_token;
  expect((await request("/api/auth/change-password",{method:"POST",jar:"admin-old",csrf,body:{target_account:"staff",current_password:initial.admin,new_password:final.staff}})).status,200,"직원 비밀번호 변경");
  expect((await request("/api/auth/me",{jar:"staff-old"})).status,401,"기존 직원 세션 무효화");
  expect((await request("/api/auth/login",{method:"POST",jar:"staff-new",body:{account:"staff",password:final.staff}})).status,200,"새 직원 비밀번호 재로그인");
  const staffNewMe = await request("/api/auth/me",{jar:"staff-new"});
  expect(staffNewMe.status,200,"새 직원 세션 확인");
  const staffCsrf = JSON.parse(staffNewMe.body).csrf_token;
  expect((await request("/api/auth/change-password",{method:"POST",jar:"admin-old",csrf,body:{target_account:"admin",current_password:initial.admin,new_password:final.admin}})).status,200,"관리자 본인 비밀번호 변경");
  expect((await request("/api/auth/me",{jar:"admin-old"})).status,401,"기존 관리자 세션 무효화");
  expect((await request("/api/auth/login",{method:"POST",jar:"admin-new",body:{account:"admin",password:final.admin}})).status,200,"새 관리자 비밀번호 재로그인");
  expect((await request("/api/auth/logout",{method:"POST",jar:"staff-new",csrf:staffCsrf,body:{}})).status,200,"로그아웃");
  expect((await request("/api/auth/me",{jar:"staff-new"})).status,401,"로그아웃 세션 종료");
  await mkdir(join(root,"local"),{recursive:true});
  await run("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",["-NoProfile","-ExecutionPolicy","Bypass","-File",join(root,"tools","protect_preview_credentials.ps1")],JSON.stringify(final));
  process.stdout.write(JSON.stringify({ ok:true, deploymentUrl, tests:15 })+"\n");
} finally {
  await rm(work,{recursive:true,force:true});
}
