import { stdin, stdout } from "node:process";
import { hashPassword } from "../api/_lib/password.mjs";

let input = "";
stdin.setEncoding("utf8");
for await (const chunk of stdin) input += chunk;
const passwords = JSON.parse(input);
const hashes = [];
for (const password of passwords) hashes.push(await hashPassword(password));
stdout.write(JSON.stringify(hashes));
