import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hashPassword, verifyPassword } from "../api/_lib/password.mjs";
import { clearSessionCookie, createSession, readCookie, sessionCookie, verifySession } from "../api/_lib/session.mjs";
import { readAuthConfig, writeAuthConfig } from "../api/_lib/store.mjs";

const secret="test-only-session-secret-that-is-long-enough";

test("password hashes verify without storing the original password",async()=>{
  const encoded=await hashPassword("a-long-test-password");
  assert.match(encoded,/^scrypt\$/);
  assert.equal(encoded.includes("a-long-test-password"),false);
  assert.equal(await verifyPassword("a-long-test-password",encoded),true);
  assert.equal(await verifyPassword("wrong-password",encoded),false);
});

test("each browser login receives an independent signed session",()=>{
  const account={id:"staff",role:"STAFF",version:3};
  const first=createSession({account,secret,now:1_000_000});
  const second=createSession({account,secret,now:1_000_000});
  assert.notEqual(first.payload.sid,second.payload.sid);
  assert.notEqual(first.token,second.token);
  assert.equal(verifySession(first.token,secret,1_000_001).sub,"staff");
  assert.equal(verifySession(second.token,secret,1_000_001).sub,"staff");
});

test("tampered and expired session tokens are rejected",()=>{
  const session=createSession({account:{id:"admin",role:"ADMIN",version:1},secret,now:1_000_000});
  assert.equal(verifySession(session.token+"x",secret,1_000_001),null);
  assert.equal(verifySession(session.token,secret,1_000_000+13*60*60*1000),null);
});

test("cookie flags are secure and logout expires only the current browser cookie",()=>{
  const value=sessionCookie("token",3600);
  assert.match(value,/HttpOnly/);assert.match(value,/Secure/);assert.match(value,/SameSite=Strict/);assert.match(value,/Max-Age=3600/);
  assert.equal(readCookie("other=1; haebaek_session=token"),"token");
  assert.match(clearSessionCookie(),/Max-Age=0/);
});

test("password version change invalidates every previously issued session",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"haebaek-auth-"));
  const previous={...process.env};
  try{
    process.env.AUTH_STORE_FILE=join(directory,"auth.json");
    process.env.AUTH_STAFF_PASSWORD_HASH=await hashPassword("initial-staff-password");
    process.env.AUTH_ADMIN_PASSWORD_HASH=await hashPassword("initial-admin-password");
    const config=await readAuthConfig();
    const before=createSession({account:config.accounts.staff,secret});
    assert.equal(verifySession(before.token,secret).ver,1);
    config.accounts.staff.passwordHash=await hashPassword("changed-staff-password");
    config.accounts.staff.version+=1;
    await writeAuthConfig(config);
    const after=await readAuthConfig();
    assert.notEqual(verifySession(before.token,secret).ver,after.accounts.staff.version);
    assert.equal(await verifyPassword("changed-staff-password",after.accounts.staff.passwordHash),true);
  }finally{
    for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];
    Object.assign(process.env,previous);await rm(directory,{recursive:true,force:true});
  }
});
