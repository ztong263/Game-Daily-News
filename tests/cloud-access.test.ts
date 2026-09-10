import test from "node:test";
import assert from "node:assert/strict";
import {assertOwner,assertSameOrigin} from "../lib/cloud/auth-policy";
import {localAccess} from "../lib/server/access";
import {cloudEnabled} from "../lib/cloud/config";
test("cloud access requires a confirmed allowlisted account and rejects forged origins",()=>{
 const user={id:"synthetic",email:"owner@example.invalid",email_confirmed_at:"2026-01-01"};
 assert.equal(assertOwner(user,"OWNER@example.invalid"),"synthetic");
 assert.throws(()=>assertOwner(null,"owner@example.invalid"));
 assert.throws(()=>assertOwner({...user,email_confirmed_at:undefined},user.email));
 assert.throws(()=>assertOwner(user,"other@example.invalid"));
 assert.throws(()=>assertOwner(user,""));
 const origin=process.env.APP_ORIGIN;process.env.APP_ORIGIN="https://daily.example.invalid";
 try{
  assert.doesNotThrow(()=>assertSameOrigin(new Request("https://internal/api",{method:"POST",headers:{origin:"https://daily.example.invalid"}})));
  assert.throws(()=>assertSameOrigin(new Request("https://internal/api",{method:"POST",headers:{origin:"https://evil.example.invalid"}})));
  assert.throws(()=>assertSameOrigin(new Request("https://internal/api",{method:"POST"})));
 }finally{if(origin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=origin;}
});
test("cloud cannot fall back to localhost access, including on Vercel",()=>{
 const mode=process.env.STORAGE_MODE,vercel=process.env.VERCEL;
 try{
  process.env.STORAGE_MODE="supabase";assert.equal(cloudEnabled(),true);
  assert.throws(()=>localAccess(new Request("http://localhost/api/brief/today")));
  process.env.STORAGE_MODE="local";process.env.VERCEL="1";
  assert.equal(cloudEnabled(),true);assert.throws(()=>localAccess(new Request("http://localhost/api/brief/today")));
 }finally{if(mode===undefined)delete process.env.STORAGE_MODE;else process.env.STORAGE_MODE=mode;if(vercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=vercel;}
});
