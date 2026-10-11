import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import handler from "../api/site.js";

class Response extends PassThrough {
  constructor(){super();this.headers={};this.body="";this.on("data",chunk=>{this.body+=chunk.toString();});}
  setHeader(name,value){this.headers[name.toLowerCase()]=value;}
}

async function call(url){
  const request={method:"GET",url,headers:{host:"localhost"}};const response=new Response();
  const finished=new Promise(resolve=>response.once("finish",resolve));await handler(request,response);await finished;return response;
}

test("login page and only its presentation assets are public",async()=>{
  const login=await call("/api/site?path=login.html");assert.equal(login.statusCode,200);
  const css=await call("/api/site?path=assets/auth.css");assert.equal(css.statusCode,200);
});

test("direct PPT-derived data and images redirect to login without a session",async()=>{
  const data=await call("/api/site?path=data/slides.json");assert.equal(data.statusCode,302);assert.match(data.headers.location,/^\/login/);
  const image=await call("/api/site?path=data/images/example.png");assert.equal(image.statusCode,302);assert.match(image.headers.location,/^\/login/);
});

test("admin HTML cannot be served without an authenticated admin session",async()=>{
  const response=await call("/api/site?path=admin.html");assert.equal(response.statusCode,302);
});
