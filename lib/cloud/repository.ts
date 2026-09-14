import type {SupabaseClient} from "@supabase/supabase-js";
import {createHash,randomUUID} from "node:crypto";
import {briefSchema,dateInZone} from "../brief/schema";
import {canonical,importSchema} from "../server/brief-versions";
import {normalizeImport} from "../brief/normalize-import";
import {defaultPreferences,preferencesSchema} from "../editorial/preferences";
import {CloudError} from "./auth-policy";
export class CloudRepository{
 constructor(private db:SupabaseClient,private ownerId:string){}
 async status(date=dateInZone(new Date(),process.env.BRIEF_TIMEZONE||"Australia/Sydney")){
  const [{data,error},task]=await Promise.all([
   this.db.from("gd_briefs").select("payload").eq("owner_id",this.ownerId).eq("brief_date",date).eq("is_active",true).maybeSingle(),
   this.db.from("gd_jobs").select("status,payload,attempts,updated_at,error_code").eq("owner_id",this.ownerId).eq("job_key","brief:"+date).maybeSingle(),
  ]);
  if(error)throw error;
  const brief=data?briefSchema.parse(data.payload):undefined;
  if(task.error)throw task.error;
  const running=task.data&&["queued","running"].includes(task.data.status);
  return {date,status:running?"generating":brief?"ready":task.data?.status==="failed"?"failed":"missing",stage:running?task.data?.payload.stage:brief?"早报已准备好":"等待准备",attempts:task.data?.attempts||0,updatedAt:task.data?Date.parse(task.data.updated_at):brief?Date.parse(brief.generatedAt):0,brief,cloudPending:!!running,budgetSummary:task.data?.payload?.budgetSummary,error:task.data?.status==="failed"?(task.data.payload?.failureMessage||"生成未完成，旧任务未记录具体原因。已有早报已保留；重新生成可能产生费用。"):undefined};
 }
 async dates(){
  const dates:string[]=[];
  for(let offset=0;;offset+=500){const {data,error}=await this.db.from("gd_briefs").select("brief_date").eq("owner_id",this.ownerId).eq("is_active",true).order("brief_date",{ascending:false}).range(offset,offset+499);
   if(error)throw error;dates.push(...(data||[]).map(row=>row.brief_date as string));if(!data||data.length<500)break;
  }return dates;
 }
 async latest(){
  const {data,error}=await this.db.from("gd_briefs").select("payload").eq("owner_id",this.ownerId).eq("is_active",true).order("brief_date",{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;return data?briefSchema.parse(data.payload):null;
 }
 async versions(date:string){
  const {data,error}=await this.db.from("gd_briefs").select("payload,is_active").eq("owner_id",this.ownerId).eq("brief_date",date).order("created_at");
  if(error)throw error;
  return (data||[]).map(row=>{const b=canonical(row.payload);return {id:b.id,version:b.version,date:b.date,title:b.title,sourceType:b.sourceType,ingestionChannel:b.ingestionChannel,createdAt:b.createdAt,active:row.is_active};});
 }
 async import(input:unknown,channel:"json_import"|"chatgpt_publish"="json_import"){
  const envelope=input&&typeof input==="object"?input as Record<string,unknown>:null;
  const request=importSchema.parse(envelope?{...envelope,brief:normalizeImport(envelope.brief)}:input);
  if(request.brief.sourceType==="generated")throw new CloudError("导入来源必须为 imported_chatgpt 或 manual。",400);
  const hash=createHash("sha256").update(JSON.stringify({brief:request.brief,activate:request.activate})).digest("hex");
  const key=createHash("sha256").update(request.brief.date+":"+request.idempotencyKey).digest("hex");
  const brief=canonical({...request.brief,ingestionChannel:channel,id:"brief_"+request.brief.date+"_"+randomUUID(),version:randomUUID(),sourceType:request.brief.sourceType||"imported_chatgpt",createdAt:new Date().toISOString()});
  const {data,error}=await this.db.rpc("gd_import_brief",{p_owner:this.ownerId,p_payload:brief,p_activate:request.activate,p_key:key,p_hash:hash});
  if(error){if(error.message.includes("IDEMPOTENCY_CONFLICT"))throw new CloudError("相同请求标识不能用于不同内容。",409);throw error;}
  return data;
 }
 async activate(date:string,id:string,version:string){
  const {data,error}=await this.db.rpc("gd_activate_brief",{p_owner:this.ownerId,p_date:date,p_id:id,p_version:version});
  if(error){if(error.message.includes("BRIEF_NOT_FOUND"))throw new CloudError("找不到这个版本。",404);throw error;}return data;
 }
 async preferences(){
  const {data,error}=await this.db.from("gd_preferences").select("settings").eq("owner_id",this.ownerId).maybeSingle();
  if(error)throw error;return data?preferencesSchema.parse(data.settings):defaultPreferences;
 }
 async savePreferences(input:unknown){
  const settings=preferencesSchema.parse(input);
  const {error}=await this.db.from("gd_preferences").upsert({owner_id:this.ownerId,settings,updated_at:new Date().toISOString()},{onConflict:"owner_id"});
  if(error)throw error;return settings;
 }
}
