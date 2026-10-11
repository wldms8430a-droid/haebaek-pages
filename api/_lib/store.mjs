import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const storePath = () => process.env.AUTH_STORE_KEY || "auth/config-v1.json";

function initialConfig() {
  const staffHash = process.env.AUTH_STAFF_PASSWORD_HASH;
  const adminHash = process.env.AUTH_ADMIN_PASSWORD_HASH;
  if (!staffHash || !adminHash) throw new Error("초기 계정 비밀번호 해시 환경변수가 필요합니다.");
  return {
    schema: 1,
    accounts: {
      staff: { id: "staff", role: "STAFF", name: "간호국 직원 공용", passwordHash: staffHash, version: 1 },
      admin: { id: "admin", role: "ADMIN", name: "간호국 관리자", passwordHash: adminHash, version: 1 }
    }
  };
}

async function blobModule() { return import("@vercel/blob"); }

export async function readAuthConfig() {
  if (process.env.AUTH_STORE_FILE) {
    try { return JSON.parse(await readFile(process.env.AUTH_STORE_FILE, "utf8")); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      const config = initialConfig();
      await writeAuthConfig(config);
      return config;
    }
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("비공개 Vercel Blob 연결이 필요합니다.");
  const { get } = await blobModule();
  const result = await get(storePath(), { access: "private", useCache: false });
  if (!result) {
    const config = initialConfig();
    await writeAuthConfig(config);
    return config;
  }
  if (result.statusCode !== 200) throw new Error("인증 설정을 불러오지 못했습니다.");
  return JSON.parse(await new Response(result.stream).text());
}

export async function writeAuthConfig(config) {
  validateConfig(config);
  if (process.env.AUTH_STORE_FILE) {
    await mkdir(dirname(process.env.AUTH_STORE_FILE), { recursive: true });
    await writeFile(process.env.AUTH_STORE_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
    return;
  }
  const { put } = await blobModule();
  await put(storePath(), JSON.stringify(config), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });
}

export function validateConfig(config) {
  for (const id of ["staff", "admin"]) {
    const account = config?.accounts?.[id];
    if (!account || account.id !== id || !["STAFF", "ADMIN"].includes(account.role) || !Number.isInteger(account.version) || account.version < 1 || typeof account.passwordHash !== "string") {
      throw new Error("인증 설정 형식이 올바르지 않습니다.");
    }
  }
}
