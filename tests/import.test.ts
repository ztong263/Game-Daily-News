import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {importBrief,activateBrief,readVersions,versionsOf} from "../lib/server/brief-versions";
import {status} from "../lib/server/store";
import {paragraphs,briefSchema} from "../lib/brief/schema";
import {POST} from "../app/api/morning-briefs/import/route";
import {GET as todayGET} from "../app/api/brief/today/route";
test("dual ingestion retains versions; import/read/activate do not make network calls",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"game-daily-import-"));const original=process.env.DATA_DIR;process.env.DATA_DIR=directory;
 const fetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error("No paid calls permitted");};
 const brief=briefSchema.parse({schemaVersion:1,id:"original",version:"v1",date:"2026-09-08",timezone:"Australia/Sydney",generatedAt:"2026-09-08T00:00:00Z",locale:"zh-CN",title:"Sample",items:[{id:"news",category:"industry",headline:"News",summary:"Summary",whyItMatters:"Why",userRelevance:"Relevant",sources:[{title:"Source",url:"https://example.com/news",publisher:"Example",publishedAt:null,kind:"primary"}],paragraphs:["Text"],uncertainty:null,design:null,workflow:null}],todaysSignal:{text:"Signal",itemIds:["news"]},editorNote:""});
 try{
  await writeFile(path.join(directory,brief.date+".json"),JSON.stringify({date:brief.date,status:"ready",stage:"Ready",attempts:1,updatedAt:Date.now(),brief}));
  const payload={brief,activate:false,idempotencyKey:"one"};const result=await importBrief(payload);assert.equal(result.active,false);
  assert.deepEqual(await importBrief(payload),result);assert.equal(versionsOf(await readVersions(brief.date)).length,2);
  assert.equal((await status(brief.date)).brief?.id,"original");
  await assert.rejects(importBrief({...payload,activate:true}),/相同请求/);
  const imported=versionsOf(await readVersions(brief.date)).find(v=>v.id===result.briefId)!;
  await activateBrief(brief.date,imported.id,imported.version);assert.equal((await status(brief.date)).brief?.id,imported.id);
  assert.deepEqual(paragraphs(imported),paragraphs(brief));
  await activateBrief(brief.date,brief.id,brief.version);assert.equal((await status(brief.date)).brief?.id,brief.id);
  const file=path.join(directory,brief.date+".json"),before=await readFile(file,"utf8");
  await assert.rejects(importBrief({...payload,brief:{...brief,items:[]},idempotencyKey:"bad"}));assert.equal(await readFile(file,"utf8"),before);
  const request=(body:string,headers:Record<string,string>={})=>new Request("http://localhost/api/morning-briefs/import",{method:"POST",headers:{"Content-Type":"application/json",...headers},body});
  assert.equal((await POST(request(JSON.stringify(payload)))).status,403);
  assert.equal((await POST(request(JSON.stringify(payload),{Authorization:"Bearer invalid"}))).status,401);
  assert.equal((await POST(request("{",{Origin:"http://localhost"}))).status,400);
  const invalid=await POST(request(JSON.stringify({...payload,brief:{}}),{Origin:"http://localhost"}));assert.equal(invalid.status,400);assert.ok((await invalid.json()).issues.length);
  const success=await POST(request(JSON.stringify({...payload,idempotencyKey:"two"}),{Origin:"http://localhost"}));assert.equal(success.status,200);
  // Even missing today's brief is a pure read; no next.after generation scheduling.
  assert.equal((await todayGET(new Request("http://localhost/api/brief/today"))).status,200);
  assert.equal(calls,0);
 }finally{globalThis.fetch=fetch;if(original===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=original;assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep+"game-daily-import-"));await rm(directory,{recursive:true,force:true});}
});
