import test from "node:test";
import assert from "node:assert/strict";
import {versionChannel} from "../lib/brief/channels";
import {CloudRepository} from "../lib/cloud/repository";
import type {SupabaseClient} from "@supabase/supabase-js";
test("legacy imports are not guessed to be GPT publications",()=>{
 assert.equal(versionChannel({sourceType:"imported_chatgpt"}),"legacy");
 assert.equal(versionChannel({sourceType:"generated"}),"website");
 assert.equal(versionChannel({sourceType:"manual"}),"json");
});
test("trusted import entry determines provenance, not JSON-supplied channel",async()=>{
 let channel="";
 const db={rpc:async(_name:string,args:{p_payload:{ingestionChannel:string}})=>{channel=args.p_payload.ingestionChannel;return {data:{ok:true},error:null};}} as unknown as SupabaseClient;
 const repo=new CloudRepository(db,"test-owner");
 const brief={schemaVersion:1,id:"a",version:"1",date:"2026-09-13",timezone:"Australia/Sydney",generatedAt:"2026-09-13T00:00:00Z",locale:"zh-CN",title:"Test",ingestionChannel:"chatgpt_publish",items:[{id:"a",category:"industry",headline:"Test",summary:"Test",whyItMatters:"Test",userRelevance:"Test",sources:[{title:"Test",url:"https://example.com",publisher:"Example",publishedAt:null,kind:"primary"}],paragraphs:["Test"],uncertainty:null,design:null,workflow:null}],todaysSignal:{text:"Test",itemIds:["a"]},editorNote:""};
 await repo.import({brief,idempotencyKey:"test"});assert.equal(channel,"json_import");
 await repo.import({brief:{...brief,ingestionChannel:"json_import"},idempotencyKey:"test2"},"chatgpt_publish");assert.equal(channel,"chatgpt_publish");
});
