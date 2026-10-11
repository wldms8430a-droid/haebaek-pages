import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const PARAMS = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64url")}$${Buffer.from(key).toString("base64url")}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const [algorithm, n, r, p, saltValue, keyValue, extra] = encoded.split("$");
  if (algorithm !== "scrypt" || extra !== undefined) return false;
  const N = Number(n), blockSize = Number(r), parallelization = Number(p);
  if (N !== PARAMS.N || blockSize !== PARAMS.r || parallelization !== PARAMS.p) return false;
  try {
    const expected = Buffer.from(keyValue, "base64url");
    if (expected.length !== KEY_LENGTH) return false;
    const actual = await scrypt(password, Buffer.from(saltValue, "base64url"), expected.length, PARAMS);
    return timingSafeEqual(expected, Buffer.from(actual));
  } catch {
    return false;
  }
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    throw new Error("비밀번호는 12자 이상 128자 이하로 입력해주세요.");
  }
}
