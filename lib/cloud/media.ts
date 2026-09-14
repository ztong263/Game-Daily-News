import type {SupabaseClient} from "@supabase/supabase-js";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {paragraphs,briefSchema} from "../brief/schema";
import {api} from "../server/openai";
import {pipelineBudget} from "../editorial/budget";
import {CloudError} from "./auth-policy";
import {cloudFailure} from "./errors";
import {DailyBudget,BudgetConfirmation,BUDGET_MODEL,textReserve,textCost,speechReserve} from "./budget";
export const AUDIO_BUCKET="game-daily-audio";
export class CloudMedia{
 constructor(readonly db:SupabaseClient,readonly ownerId:string){}
 async usage(eventKey:string,stage:string,model:string,usage:{input_tokens?:number;output_tokens?:number}|null,details:object={},toolCalls=0){
  const {error}=await this.db.from("gd_usage").upsert({owner_id:this.ownerId,event_key:eventKey,stage,model,input_tokens:usage?.input_tokens??null,output_tokens:usage?.output_tokens??null,tool_calls:toolCalls,details},{onConflict:"owner_id,event_key",ignoreDuplicates:true});
  if(error)throw new CloudError("用量记录保存失败，请稍后重试。",503);
 }
 async brief(date:string,version:string){
  const {data,error}=await this.db.from("gd_briefs").select("payload").eq("owner_id",this.ownerId).eq("brief_date",date).eq("is_active",true).maybeSingle();
  if(error)throw error;const brief=data?briefSchema.parse(data.payload):null;
  if(!brief||brief.version!==version)throw new CloudError("早报版本已变化，请刷新。",409);return brief;
 }
 private async cached(key:string){
  const {data,error}=await this.db.from("gd_audio").select("object_path,metadata").eq("owner_id",this.ownerId).eq("cache_key",key).maybeSingle();
  if(error)throw error;return data;
 }
 async speech(input:unknown){
  const data=z.object({date:z.iso.date(),version:z.string().max(200),index:z.number().int().nonnegative(),language:z.enum(["zh","en"])}).parse(input);
  const part=paragraphs(await this.brief(data.date,data.version))[data.index];if(!part)throw new CloudError("段落不存在。",400);
  const model="gpt-4o-mini-tts",voice=process.env.TTS_VOICE||"marin",translationModel=BUDGET_MODEL;
  const key=createHash("sha256").update(JSON.stringify({version:data.version,text:part.text,language:data.language,model,voice,translationModel,v:1})).digest("hex");
  const hit=await this.cached(key);if(hit)return {url:"/api/speech?key="+key,text:hit.metadata.text,cacheHit:true};
  if(pipelineBudget().offline)throw new CloudError("离线模式只能播放已缓存音频。",409);
  const token=randomUUID();const claim=await this.db.rpc("gd_claim_speech",{p_owner:this.ownerId,p_key:key,p_token:token});
  if(claim.error)throw claim.error;if(!claim.data)return {pending:true};
  let completed=false;
  let stage="cache_read";
  try{
   const hit=await this.cached(key);if(hit){completed=true;return {url:"/api/speech?key="+key,text:hit.metadata.text,cacheHit:true};}
   let text=part.text;
   if(data.language==="en"){
    stage="translation_cache";
    const cachedTranslation=await this.db.from("gd_pipeline_cache").select("payload").eq("owner_id",this.ownerId).eq("cache_key","translation:"+key).maybeSingle();
    if(cachedTranslation.error)throw cachedTranslation.error;
    if(typeof cachedTranslation.data?.payload?.text==="string"&&cachedTranslation.data.payload.text.trim())text=cachedTranslation.data.payload.text;
    else{
    stage="translation_request";
    const budget=new DailyBudget(this.db,this.ownerId),reservation=await budget.reserve(textReserve(text,2000),"listening");
    const translated=await api().responses.create({model:translationModel,max_output_tokens:2000,instructions:"Translate this prepared broadcast paragraph into natural spoken English. Preserve facts, caveats and examples. Add nothing. Return only the translation.",input:text},{timeout:90000,maxRetries:0});
    await this.usage(translated.id,"translation",translationModel,translated.usage??null,{date:data.date,version:data.version,index:data.index,usage:translated.usage});
    if(translated.usage)await budget.settle(reservation,textCost(translated.usage.input_tokens,translated.usage.output_tokens));
    if(translated.status!=="completed"||!translated.output_text.trim())throw new CloudError("翻译未完成，请稍后重试。",502);text=translated.output_text;
    const savedTranslation=await this.db.from("gd_pipeline_cache").upsert({owner_id:this.ownerId,cache_key:"translation:"+key,payload:{text,usage:translated.usage},expires_at:null},{onConflict:"owner_id,cache_key"});
    if(savedTranslation.error)throw savedTranslation.error;
    }
   }
   const event=randomUUID();
   stage="speech_request";
   const speechBudget=new DailyBudget(this.db,this.ownerId),speechAmount=speechReserve(text);
   const speechReservation=await speechBudget.reserve(speechAmount,"listening");
   const audio=await api().audio.speech.create({model,voice:voice as "marin",input:text,response_format:"mp3",instructions:"Read exactly the provided script in a warm, clear conversational presenter voice. Keep a natural pace; do not add or omit content."},{timeout:120000,maxRetries:0});
   stage="audio_read";
   const bytes=Buffer.from(await audio.arrayBuffer());
   await speechBudget.settle(speechReservation,speechAmount);
   // Record every successful synthesis, even if the subsequent upload fails.
   stage="usage_save";
   await this.usage(event,"speech",model,null,{date:data.date,version:data.version,index:data.index,language:data.language,characters:[...text].length,bytes:bytes.length,ttsUsage:null});
   const objectPath=this.ownerId+"/"+key+".mp3";
   stage="audio_upload";
   const uploaded=await this.db.storage.from(AUDIO_BUCKET).upload(objectPath,bytes,{contentType:"audio/mpeg",upsert:true});if(uploaded.error)throw uploaded.error;
   stage="audio_index";
   const saved=await this.db.from("gd_audio").upsert({owner_id:this.ownerId,cache_key:key,object_path:objectPath,metadata:{...data,text,model,voice,characters:[...text].length,bytes:bytes.length,ttsUsage:null}},{onConflict:"owner_id,cache_key"});if(saved.error)throw saved.error;
   completed=true;return {url:"/api/speech?key="+key,text,cacheHit:false};
  }catch(error){
   if(error instanceof BudgetConfirmation)throw error;
   const failure=cloudFailure(error);
   // Only fixed labels are logged. Never include messages, scripts, IDs or keys.
   const kind=error instanceof TypeError?"TypeError":error instanceof Error?"Error":"Other";
   console.error("cloud_speech_failed",{stage,kind,status:failure.status});
   throw new CloudError(failure.error+"（定位："+stage+" / "+kind+"）",failure.status);
  }finally{
   await this.db.from("gd_jobs").update({status:completed?"completed":"failed",lease_until:null,updated_at:new Date().toISOString()}).eq("owner_id",this.ownerId).eq("job_key","speech:"+key).eq("payload->>token",token);
  }
 }
 async download(input:string|null){
  const key=z.string().regex(/^[a-f0-9]{64}$/).parse(input),row=await this.cached(key);
  if(!row||!row.object_path.startsWith(this.ownerId+"/"))throw new CloudError("音频不存在。",404);
  const {data,error}=await this.db.storage.from(AUDIO_BUCKET).download(row.object_path);if(error||!data)throw new CloudError("音频暂时无法读取，请重试。",502);
  return new Response(data,{headers:{"Content-Type":"audio/mpeg","Cache-Control":"private, no-store"}});
 }
}
