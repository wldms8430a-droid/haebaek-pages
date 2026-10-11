import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import login from "../api/auth/login.js";
import me from "../api/auth/me.js";
import changePassword from "../api/auth/change-password.js";
import site from "../api/site.js";
import { hashPassword } from "../api/_lib/password.mjs";

class Response extends PassThrough {
  constructor(){super();this.headers={};this.body="";this.on("data",chunk=>{this.body+=chunk.toString();});}
  setHeader(name,value){this.headers[name.toLowerCase()]=value;}
}
async function invoke(handler,request){const response=new Response();const finished=new Promise(resolve=>response.once("finish",resolve));await handler(request,response);await finished;return response;}

test("staff login creates a browser cookie and cannot open the admin page",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"haebaek-api-"));const previous={...process.env};
  try{
    process.env.AUTH_STORE_FILE=join(directory,"auth.json");
    process.env.AUTH_SESSION_SECRET="integration-test-session-secret-long-enough";
    process.env.AUTH_STAFF_PASSWORD_HASH=await hashPassword("staff-test-password");
    process.env.AUTH_ADMIN_PASSWORD_HASH=await hashPassword("admin-test-password");
    const signedIn=await invoke(login,{method:"POST",headers:{origin:"https://example.test",host:"example.test"},body:{account:"staff",password:"staff-test-password",remember:true}});
    assert.equal(signedIn.statusCode,200);assert.match(signedIn.headers["set-cookie"],/HttpOnly/);
    const cookie=signedIn.headers["set-cookie"].split(";")[0];
    const current=await invoke(me,{method:"GET",headers:{host:"example.test",cookie}});assert.equal(current.statusCode,200);assert.equal(JSON.parse(current.body).account.role,"STAFF");
    const denied=await invoke(site,{method:"GET",url:"/api/site?path=admin.html",headers:{host:"example.test",cookie}});assert.equal(denied.statusCode,403);
  }finally{
    for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);await rm(directory,{recursive:true,force:true});
  }
});

test("admin changes staff and own passwords and invalidates only the changed account sessions",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"haebaek-password-admin-"));const previous={...process.env};
  try{
    process.env.AUTH_STORE_FILE=join(directory,"auth.json");
    process.env.AUTH_SESSION_SECRET="integration-test-session-secret-long-enough";
    process.env.AUTH_STAFF_PASSWORD_HASH=await hashPassword("staff-original-password");
    process.env.AUTH_ADMIN_PASSWORD_HASH=await hashPassword("admin-original-password");
    const headers={origin:"https://example.test",host:"example.test"};
    const staffSignedIn=await invoke(login,{method:"POST",headers,body:{account:"staff",password:"staff-original-password"}});
    const staffCookie=staffSignedIn.headers["set-cookie"].split(";")[0];
    const adminSignedIn=await invoke(login,{method:"POST",headers,body:{account:"admin",password:"admin-original-password"}});
    const adminCookie=adminSignedIn.headers["set-cookie"].split(";")[0];
    const adminCurrent=await invoke(me,{method:"GET",headers:{host:"example.test",cookie:adminCookie}});
    const csrf=JSON.parse(adminCurrent.body).csrf_token;

    const staffChanged=await invoke(changePassword,{method:"POST",headers:{...headers,cookie:adminCookie,"x-csrf-token":csrf},body:{target_account:"staff",current_password:"admin-original-password",new_password:"staff-replacement-password"}});
    assert.equal(staffChanged.statusCode,200);
    assert.equal(staffChanged.headers["set-cookie"],undefined);
    assert.equal((await invoke(me,{method:"GET",headers:{host:"example.test",cookie:staffCookie}})).statusCode,401);
    assert.equal((await invoke(me,{method:"GET",headers:{host:"example.test",cookie:adminCookie}})).statusCode,200);
    assert.equal((await invoke(login,{method:"POST",headers,body:{account:"staff",password:"staff-replacement-password"}})).statusCode,200);

    const wrongCurrent=await invoke(changePassword,{method:"POST",headers:{...headers,cookie:adminCookie,"x-csrf-token":csrf},body:{target_account:"admin",current_password:"wrong-admin-password",new_password:"admin-replacement-password"}});
    assert.equal(wrongCurrent.statusCode,401);
    const adminChanged=await invoke(changePassword,{method:"POST",headers:{...headers,cookie:adminCookie,"x-csrf-token":csrf},body:{target_account:"admin",current_password:"admin-original-password",new_password:"admin-replacement-password"}});
    assert.equal(adminChanged.statusCode,200);
    assert.match(adminChanged.headers["set-cookie"],/Max-Age=0/);
    assert.equal((await invoke(me,{method:"GET",headers:{host:"example.test",cookie:adminCookie}})).statusCode,401);
    assert.equal((await invoke(login,{method:"POST",headers,body:{account:"admin",password:"admin-replacement-password"}})).statusCode,200);
  }finally{
    for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);await rm(directory,{recursive:true,force:true});
  }
});
