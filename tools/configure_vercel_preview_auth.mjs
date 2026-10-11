import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { stdin, stdout } from "node:process";
import { hashPassword } from "../api/_lib/password.mjs";

const cli = process.argv[2];
const branch = process.argv[3] || "codex/vercel-auth-preview";

if (!cli) throw new Error("Vercel CLI 경로가 필요합니다.");
if (!stdin.isTTY) throw new Error("화면 입력이 가능한 로컬 터미널에서 실행해주세요.");

async function readSecret(prompt) {
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let value = "";

  return new Promise((resolve, reject) => {
    function cleanup() {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    }

    function onData(chunk) {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("입력이 취소되었습니다."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          stdout.write("•");
        }
      }
    }

    stdin.on("data", onData);
  });
}

async function readConfirmedPassword(label) {
  const first = await readSecret(`${label} 비밀번호: `);
  const second = await readSecret(`${label} 비밀번호 확인: `);
  if (first !== second) throw new Error(`${label} 비밀번호가 일치하지 않습니다.`);
  return first;
}

function addEnvironmentVariable(name, value) {
  return new Promise((resolve, reject) => {
    const args = [
      "env", "add", name, "preview",
      "--git-branch", branch,
      "--sensitive", "--force", "--yes", "--no-color",
    ];
    const child = spawn(cli, args, {
      cwd: process.cwd(),
      shell: process.platform === "win32",
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.stdin.end(`${value}\n`);
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${name} 등록 실패 (종료 코드 ${code})`));
    });
  });
}

const staffPassword = await readConfirmedPassword("직원 공용 계정");
const adminPassword = await readConfirmedPassword("관리자 계정");
const staffHash = await hashPassword(staffPassword);
const adminHash = await hashPassword(adminPassword);
const sessionSecret = randomBytes(48).toString("base64url");

await addEnvironmentVariable("AUTH_SESSION_SECRET", sessionSecret);
await addEnvironmentVariable("AUTH_STAFF_PASSWORD_HASH", staffHash);
await addEnvironmentVariable("AUTH_ADMIN_PASSWORD_HASH", adminHash);

stdout.write(`Preview 인증 환경변수 3개를 ${branch} 브랜치에 등록했습니다.\n`);
