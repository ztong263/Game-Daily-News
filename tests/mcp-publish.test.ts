import test from "node:test";
import assert from "node:assert/strict";
import {authorizationInput,callback,challenge,clientId,limitedBody,scope} from "../lib/publish/protocol";
import {exchange} from "../lib/publish/exchange";
import type {Grant,GrantStore} from "../lib/publish/store";
import {handleMcp} from "../lib/publish/mcp";
import {POST} from "../app/mcp/route";
const origin="https://example.com",verifier="a".repeat(43);
const params=()=>new URLSearchParams({client_id:clientId,redirect_uri:callback,response_type:"code",code_challenge_method:"S256",code_challenge:challenge(verifier),resource:origin+"/mcp",scope,state:"test-state"});
test("OAuth binds redirect, resource, scope and PKCE",()=>{
 assert.equal(authorizationInput(params(),origin).redirect,callback);
 for(const [key,value] of [["redirect_uri","https://attacker.example"],["resource","https://other.example/mcp"],["scope","admin"],["code_challenge_method","plain"],["client_id","other"]]){const p=params();p.set(key,value);assert.throws(()=>authorizationInput(p,origin));}
});
test("OAuth codes and refresh tokens cannot replay; invalid verifier does not consume code",async()=>{
 const map=new Map<string,{owner:string;grant:Grant}>();let sequence=0;
 const store={read:async(t:string,k:string)=>{const item=map.get(k+t);if(!item)throw Error("invalid_grant");return item;},consume:async(t:string,k:string)=>{if(!map.delete(k+t))throw Error("invalid_grant");},issue:async(owner:string,k:string,grant:Grant)=>{const token=String(++sequence);map.set(k+token,{owner,grant});return token;}} as unknown as GrantStore;
 map.set("codeoriginal",{owner:"test",grant:authorizationInput(params(),origin)});
 const p=new URLSearchParams({grant_type:"authorization_code",client_id:clientId,resource:origin+"/mcp",redirect_uri:callback,code:"original",code_verifier:"b".repeat(43)});
 await assert.rejects(exchange(p,origin,store),/invalid_grant/);assert.ok(map.has("codeoriginal"));p.set("code_verifier",verifier);
 const result=await exchange(p,origin,store);assert.equal(result.scope,scope);await assert.rejects(exchange(p,origin,store),/invalid_grant/);
 const refresh=new URLSearchParams({grant_type:"refresh_token",client_id:clientId,resource:origin+"/mcp",refresh_token:result.refresh_token});
 await exchange(refresh,origin,store);await assert.rejects(exchange(refresh,origin,store),/invalid_grant/);
});
test("MCP publishes valid input and rejects invalid source/game radar before writing",async()=>{
 let calls=0;const publish=async()=>{calls++;return {ok:true};};
 const invoke=async(method:string,params:unknown)=>{
  const body={jsonrpc:"2.0",id:1,method,params};
  const request=new Request(origin+"/mcp",{method:"POST",headers:{"content-type":"application/json",accept:"application/json, text/event-stream"},body:JSON.stringify(body)});
  const response=await handleMcp(request,body,publish);assert.equal(response.status,200);return response.json();
 };
 const tools=await invoke("tools/list",{});assert.equal(tools.result.tools.length,1);assert.equal(tools.result.tools[0].name,"publish_morning_brief");
 const brief={schemaVersion:1,id:"test",version:"v1",date:"2026-09-13",timezone:"Australia/Sydney",generatedAt:"2026-09-13T00:00:00Z",locale:"zh-CN",title:"Test",items:[{id:"one",category:"industry",headline:"Test",summary:"Test",whyItMatters:"Test",userRelevance:"Test",sources:[{title:"Source",url:"https://example.com/news",publisher:"Example",publishedAt:null,kind:"primary"}],paragraphs:["Test"],uncertainty:null,design:null,workflow:null}],todaysSignal:{text:"Test",itemIds:["one"]},editorNote:""};
 assert.equal((await invoke("tools/call",{name:"publish_morning_brief",arguments:{brief,idempotencyKey:"one",activate:false}})).result.isError,undefined);assert.equal(calls,1);
 const invalid=structuredClone(brief);invalid.items[0].category="game_radar";
 assert.equal((await invoke("tools/call",{name:"publish_morning_brief",arguments:{brief:invalid,idempotencyKey:"two"}})).result.isError,true);assert.equal(calls,1);
});
test("request size is bounded even without Content-Length",async()=>{
 await assert.rejects(limitedBody(new Request(origin,{method:"POST",body:"12345"}),4),/payload_too_large/);
});
test("disabled connector and missing credentials cannot write or call external APIs",async()=>{
 const names=["ENABLE_CHATGPT_MCP_PUBLISH","APP_ORIGIN","NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SECRET_KEY"] as const;
 const saved=names.map(n=>process.env[n]);const originalFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error("No external requests");};
 const request=()=>new Request(origin+"/mcp",{method:"POST",headers:{"content-type":"application/json",accept:"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"publish_morning_brief",arguments:{}}})});
 try{
  process.env.ENABLE_CHATGPT_MCP_PUBLISH="false";assert.equal((await POST(request())).status,503);
  process.env.ENABLE_CHATGPT_MCP_PUBLISH="true";process.env.APP_ORIGIN=origin;process.env.NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co";process.env.SUPABASE_SECRET_KEY="synthetic-test-only";
  const response=await POST(request());assert.equal(response.status,401);assert.ok(response.headers.get("www-authenticate")?.includes("oauth-protected-resource"));assert.equal(calls,0);
 }finally{names.forEach((n,i)=>{if(saved[i]===undefined)delete process.env[n];else process.env[n]=saved[i];});globalThis.fetch=originalFetch;}
});
