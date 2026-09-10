import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import { historyDates, status } from "../lib/server/store";
import { GET } from "../app/api/brief/history/route";
test("history lists saved valid briefs only and retrieves the requested date",async()=>{
  const original=process.env.DATA_DIR;
  const directory=await mkdtemp(path.join(tmpdir(),"game-daily-history-"));process.env.DATA_DIR=directory;
  const item={id:"one",category:"industry",headline:"Headline",summary:"Summary",whyItMatters:"Why",userRelevance:"Useful",sources:[{title:"Source",url:"https://example.com",publisher:"Publisher",publishedAt:null,kind:"primary"}],paragraphs:["Paragraph"],uncertainty:null,design:null,workflow:null};
  const brief={schemaVersion:1,id:"brief-old",version:"1",date:"2026-09-08",timezone:"Australia/Sydney",generatedAt:"2026-09-08T00:00:00Z",locale:"zh-CN",title:"Old brief",items:[item],todaysSignal:{text:"Signal",itemIds:["one"]},editorNote:""};
  try {
    await writeFile(path.join(directory,"2026-09-08.json"),JSON.stringify({date:brief.date,status:"ready",brief,attempts:1,updatedAt:Date.now()}));
    await writeFile(path.join(directory,"2026-09-09.json"),"broken");
    await writeFile(path.join(directory,"2026-09-07.audit.json"),JSON.stringify({brief}));
    assert.deepEqual(await historyDates(),["2026-09-08"]);
    assert.equal((await status("2026-09-08")).brief?.title,"Old brief");
    const response=await GET(new Request("http://localhost/api/brief/history?date=2026-09-08"));
    assert.equal(response.status,200);assert.equal((await response.json()).brief.date,"2026-09-08");
    assert.equal((await GET(new Request("http://localhost/api/brief/history?date=2026-09-06"))).status,404);
    assert.equal((await GET(new Request("http://localhost/api/brief/history?date=../preferences"))).status,400);
  }finally {
    if(original===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=original;
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep+"game-daily-history-"));
    await rm(directory,{recursive:true,force:true});
  }
});
