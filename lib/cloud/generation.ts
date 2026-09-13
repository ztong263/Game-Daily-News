import type {SupabaseClient} from "@supabase/supabase-js";
import {randomUUID} from "node:crypto";
import {fingerprint} from "./fingerprint";
import {CloudRepository} from "./repository";
import {CloudPipeline} from "./pipeline";
import {CloudError} from "./auth-policy";
import {pipelineStorage,PipelinePending} from "../editorial/storage-context";
import {generateBrief} from "../editorial/generate";
import {canonical} from "../server/brief-versions";
import {pipelineBudget} from "../editorial/budget";
import {generationError} from "./generation-error";
export async function startGeneration(db:SupabaseClient,ownerId:string,date:string){
 if(pipelineBudget().offline)throw new CloudError("当前模式不生成新闻。",409);
 const repo=new CloudRepository(db,ownerId);
 const preferences=await repo.preferences();
 const history:string[]=[];for(const day of (await repo.dates()).filter(d=>d<date).slice(0,14)){const brief=(await repo.status(day)).brief;brief?.items.forEach(i=>history.push(i.headline+" "+i.sources.map(s=>s.url).join(" ")));}
 const {error}=await db.rpc("gd_start_generation",{p_owner:ownerId,p_date:date,p_payload:{runId:randomUUID(),date,preferences,history,stage:"正在准备检索",startedAt:Date.now()}});
 if(error){if(error.message.includes("DAILY_LIMIT"))throw new CloudError("今日已达三次生成上限。",429);throw error;}
 return {accepted:true};
}
export async function advanceGeneration(db:SupabaseClient,ownerId:string,date:string){
 const token=randomUUID();const {data:job,error}=await db.rpc("gd_claim_generation_step",{p_owner:ownerId,p_date:date,p_token:token});
 if(error)throw error;if(!job)return {pending:false};
 const payload={...job.payload};let status="running",errorCode:string|null=null;
 const storage=new CloudPipeline(db,ownerId,payload.runId,payload.preferences);
 try{
  if(Date.now()-payload.startedAt>86400000)throw Error("GENERATION_EXPIRED");
  const result=await pipelineStorage.run(storage,()=>generateBrief(date,process.env.BRIEF_TIMEZONE||"Australia/Sydney",payload.history,async stage=>{payload.stage=stage;}));
  // The publication is idempotent even if the final job-status write is interrupted.
  const publicationKey="publication:"+payload.runId;
  let brief=await storage.get(publicationKey);
  if(!brief){brief=canonical(result.brief);await storage.put(publicationKey,brief);}
  await storage.artifact(date,"audit",result.audit);
  const published=await db.rpc("gd_import_brief",{p_owner:ownerId,p_payload:brief,p_activate:true,p_key:publicationKey,p_hash:fingerprint(brief)});
  if(published.error)throw published.error;
  status="completed";payload.stage="早报已准备好";
 }catch(e){
  if(!(e instanceof PipelinePending)){status="failed";errorCode=e instanceof Error&&e.message==="UNCERTAIN_RESPONSE_START"?"UNCERTAIN_RESPONSE_START":"GENERATION_FAILED";payload.failureMessage=generationError(e);payload.stage="生成未完成，已保存进度和现有早报";}
 }finally{
  const saved=await db.from("gd_jobs").update({status,payload,lease_until:null,error_code:errorCode,updated_at:new Date().toISOString()}).eq("owner_id",ownerId).eq("id",job.id).eq("payload->>step_token",token);
  if(saved.error)throw saved.error;
 }
 return {pending:status==="running",failed:status==="failed"};
}
