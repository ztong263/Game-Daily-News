import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {pipelineBudget} from "../lib/editorial/budget";
import {runToday,today,status} from "../lib/server/store";
import {recordUsage} from "../lib/editorial/telemetry";
import {researchNews} from "../lib/editorial/research";
import {generateBrief} from "../lib/editorial/generate";
test("mode budgets enforce search ceilings and avoid Astra in preview by default",()=>{
  assert.equal(pipelineBudget({}).searchCalls,6);
  assert.equal(pipelineBudget({EDITORIAL_MODE:"preview"}).searchCalls,2);
  assert.equal(pipelineBudget({EDITORIAL_MODE:"preview",EDITORIAL_MODEL:"gpt-6-astra"}).finalModel,"gpt-5.4-mini");
  assert.throws(()=>pipelineBudget({EDITORIAL_MAX_TOOL_CALLS:"9"}));
  assert.throws(()=>pipelineBudget({EDITORIAL_MODE:"preview",EDITORIAL_MAX_TOOL_CALLS:"4"}));
  assert.equal(pipelineBudget({EDITORIAL_MODE:"mock"}).searchCalls,0);
});
test("saved daily brief survives 20 generation requests; offline modes never fetch; telemetry records actual usage",async()=>{
  const original={dir:process.env.DATA_DIR,mode:process.env.EDITORIAL_MODE};
  const directory=await mkdtemp(path.join(tmpdir(),"game-daily-budget-"));
  process.env.DATA_DIR=directory;process.env.EDITORIAL_MODE="production";
  const originalFetch=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw Error("Unexpected paid request");};
  try {
    const date=today();
    const brief={schemaVersion:1,id:"saved",version:"1",date,timezone:"Australia/Sydney",generatedAt:new Date().toISOString(),locale:"zh-CN",title:"Saved",items:[{id:"one",category:"industry",headline:"News",summary:"Summary",whyItMatters:"Why",userRelevance:"Useful",sources:[{title:"Source",url:"https://example.com",publisher:"Publisher",publishedAt:null,kind:"primary"}],paragraphs:["Paragraph"],uncertainty:null,design:null,workflow:null}],todaysSignal:{text:"Signal",itemIds:["one"]},editorNote:""};
    const file=path.join(directory,date+".json");
    const saved=JSON.stringify({date,status:"ready",brief,attempts:1,updatedAt:Date.now()});
    await writeFile(file,saved);
    for(let i=0;i<20;i++)await runToday();
    assert.equal(await readFile(file,"utf8"),saved);
    process.env.EDITORIAL_MODE="preview";
    assert.equal((await status()).status,"missing");
    for(const mode of ["mock","voice-test"]){
      process.env.EDITORIAL_MODE=mode;
      await runToday();
      await assert.rejects(researchNews(date,"Australia/Sydney",[]),/Offline/);
      await assert.rejects(generateBrief(date,"Australia/Sydney",[],async()=>{}),/Offline/);
    }
    assert.equal(calls,0);
    await recordUsage(date,"discovery",{id:"test-response",model:"test",status:"completed",usage:{input_tokens:123,output_tokens:45,total_tokens:168},output:[{type:"web_search_call"},{type:"message"}]});
    const lines=(await readFile(path.join(directory,"telemetry/editorial.jsonl"),"utf8")).trim().split("\n").map(s=>JSON.parse(s));
    assert.equal(lines.filter(l=>l.cacheHit).length,22);
    assert.equal(lines.at(-1).toolCalls,1);assert.equal(lines.at(-1).inputTokens,123);
  }finally {
    globalThis.fetch=originalFetch;
    if(original.dir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=original.dir;
    if(original.mode===undefined)delete process.env.EDITORIAL_MODE;else process.env.EDITORIAL_MODE=original.mode;
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep+"game-daily-budget-"));
    await rm(directory,{recursive:true,force:true});
  }
});
