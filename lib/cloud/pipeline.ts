import type {SupabaseClient} from "@supabase/supabase-js";
import type {Response,ResponseCreateParamsNonStreaming} from "openai/resources/responses/responses";
import {createHash} from "node:crypto";
import {api} from "../server/openai";
import {briefSchema} from "../brief/schema";
import {citationKey} from "../brief/source-url";
import {CloudMedia} from "./media";
import {PipelinePending,type PipelineStorage,type ResearchValue} from "../editorial/storage-context";
import type {EditorialPreferences} from "../editorial/preferences";
import {DailyBudget,BUDGET_MODEL,textReserve,textCost} from "./budget";
export class CloudPipeline implements PipelineStorage{
 constructor(readonly db:SupabaseClient,readonly ownerId:string,readonly runId:string,readonly snapshot:EditorialPreferences){}
 async get(key:string){const {data,error}=await this.db.from("gd_pipeline_cache").select("payload,expires_at").eq("owner_id",this.ownerId).eq("cache_key",key).maybeSingle();if(error)throw error;if(!data||data.expires_at&&Date.parse(data.expires_at)<Date.now())return null;return data.payload;}
 async put(key:string,payload:unknown,expiresAt:string|null=null){const {error}=await this.db.from("gd_pipeline_cache").upsert({owner_id:this.ownerId,cache_key:key,payload,expires_at:expiresAt,updated_at:new Date().toISOString()},{onConflict:"owner_id,cache_key"});if(error)throw error;}
 async preferences(){return this.snapshot;}
 async history(date:string){
  const seen={urls:new Set<string>(),events:new Set<string>(),titles:new Set<string>()};
  const normalize=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
  // Include every archived version, not just today's selected version.
  for(let offset=0;;offset+=500){
   const {data,error}=await this.db.from("gd_briefs").select("payload").eq("owner_id",this.ownerId).neq("brief_date",date).order("id").range(offset,offset+499);if(error)throw error;
   for(const row of data||[]){const b=briefSchema.parse(row.payload);for(const item of b.items){item.sources.forEach(s=>seen.urls.add(citationKey(s.url)));seen.titles.add(normalize(item.headline));if(item.eventKey)seen.events.add(normalize(item.eventKey));}}
   if(!data||data.length<500)break;
  }
  return seen;
 }
 async research(key:string){const v=await this.get("research:"+createHash("sha256").update(key).digest("hex"));return v?{output_text:v.output_text,allowed:new Set<string>(v.urls),radarCoverage:v.radarCoverage}:null;}
 async saveResearch(key:string,v:ResearchValue){await this.put("research:"+createHash("sha256").update(key).digest("hex"),{output_text:v.output_text,urls:[...v.allowed],radarCoverage:v.radarCoverage},new Date(Date.now()+86400000).toISOString());}
 async artifact(date:string,stage:string,payload:unknown){await this.put("artifact:"+this.runId+":"+date+":"+stage,payload);}
 async usage(date:string,stage:string,input:unknown,cacheHit:boolean){
  const r=input as Response|undefined;
  await new CloudMedia(this.db,this.ownerId).usage(r?.id||this.runId+":"+stage+(cacheHit?":cache":""),stage,r?.model||"none",r?.usage??null,{date,cacheHit,status:r?.status,usage:r?.usage},r?.output?.filter(o=>o.type==="web_search_call").length||0);
 }
 async response(params:ResponseCreateParamsNonStreaming):Promise<Response>{
  params={...params,model:BUDGET_MODEL,service_tier:"default",max_output_tokens:Math.min(params.max_output_tokens||8000,8000)};
  const key="response:"+this.runId+":"+createHash("sha256").update(JSON.stringify(params)).digest("hex");
  const checkpoint=await this.get(key);
  if(checkpoint?.response)return checkpoint.response as Response;
  if(checkpoint?.starting)throw Error("UNCERTAIN_RESPONSE_START");
  let result:Response;
  const budget=new DailyBudget(this.db,this.ownerId,checkpoint?.budgetDay);
  if(checkpoint?.responseId){result=await api().responses.retrieve(checkpoint.responseId,{},{timeout:20000});}
  else{
   const calls=params.tools?.some(t=>t.type==="web_search")?Number((params as unknown as {max_tool_calls?:number}).max_tool_calls||3):0;
   await budget.reserve(textReserve(params,params.max_output_tokens!,calls),"generation",key);
   // Persist intent before the billable call. A crash here must never silently retry it.
   await this.put(key,{starting:true,budgetDay:budget.day});
   result=await api().responses.create({...params,background:true,store:true},{timeout:20000});
  }
  if(result.status==="queued"||result.status==="in_progress"){
   await this.put(key,{responseId:result.id,budgetDay:budget.day});throw new PipelinePending();
  }
  if(result.usage)await budget.settle(key,textCost(result.usage.input_tokens,result.usage.output_tokens,result.output.filter(o=>o.type==="web_search_call").length));
  await this.put(key,{response:result});return result;
 }
}
