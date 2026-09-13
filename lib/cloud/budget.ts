import type {SupabaseClient} from "@supabase/supabase-js";
import {randomUUID} from "node:crypto";
import {dateInZone} from "../brief/schema";
import {CloudError} from "./auth-policy";
export const DAILY_LIMIT=.50, GENERATION_LIMIT=.20, SAFETY_MARGIN=.03;
export const BUDGET_MODEL="gpt-5.4-mini";
type Entry={amount:number;group:"generation"|"listening";settled:boolean};
export type Ledger={revision:number;entries:Record<string,Entry>};
export const round=(n:number)=>Math.ceil(n*1e6)/1e6;
export function textCost(input:number,output:number,calls=0){return round((input*.75+output*4.5)/1e6+calls*.01);}
export function textReserve(input:unknown,output:number,calls=0){return textCost(Buffer.byteLength(JSON.stringify(input))+1024+calls*16000,output,calls);}
// Binary TTS does not report tokens. Keep this conservative estimate charged,
// rather than releasing a reservation on an unobservable actual cost.
export function speechReserve(text:string){return round(Math.max(.003,[...text].length*.00012));}
export function totals(l:Ledger){const e=Object.values(l.entries);return {used:round(e.reduce((n,e)=>n+e.amount,0)),generation:round(e.filter(e=>e.group==="generation").reduce((n,e)=>n+e.amount,0)),pending:round(e.filter(e=>!e.settled).reduce((n,e)=>n+e.amount,0))};}
export function reserveEntry(l:Ledger,id:string,amount:number,group:Entry["group"]){
 if(l.entries[id])throw new CloudError("这次请求已经登记，请等待结果，勿重复发送。",409);
 if(!Number.isFinite(amount)||amount<=0)throw Error("Invalid budget reservation");
 const t=totals(l);
 if(t.used+amount>DAILY_LIMIT-SAFETY_MARGIN+1e-9)throw new CloudError("今日剩余预算不足，已暂停新的付费请求；仍可阅读和播放缓存音频。",429);
 if(group==="generation"&&t.generation+amount>GENERATION_LIMIT+1e-9)throw new CloudError("今日生成预算不足，已为朗读和问答保留额度。",429);
 l.entries[id]={amount:round(amount),group,settled:false};
}
export class DailyBudget{
 constructor(readonly db:SupabaseClient,readonly owner:string,readonly day=dateInZone(new Date(),"Australia/Sydney")){}
 private key(){return "daily-budget:"+this.day;}
 private async load():Promise<Ledger>{
  const row=await this.db.from("gd_pipeline_cache").select("payload").eq("owner_id",this.owner).eq("cache_key",this.key()).maybeSingle();if(row.error)throw row.error;
  if(row.data)return row.data.payload as Ledger;
  // Existing usage must not disappear on deployment. Read billing metadata only.
  const legacy:Ledger={revision:0,entries:{}};
  for(let offset=0;;offset+=500){
   const r=await this.db.from("gd_usage").select("stage,model,input_tokens,output_tokens,tool_calls,estimated_usd,created_at,characters:details->characters").eq("owner_id",this.owner).gte("created_at",new Date(Date.parse(this.day+"T00:00:00Z")-14*3600000).toISOString()).lt("created_at",this.day+"T23:59:59Z").order("created_at").range(offset,offset+499);if(r.error)throw r.error;
   for(const [i,v] of (r.data||[]).entries()){
    if(dateInZone(new Date(v.created_at),"Australia/Sydney")!==this.day)continue;
    let amount=Number(v.estimated_usd);
    if(v.estimated_usd===null){
     if(v.model===BUDGET_MODEL&&v.input_tokens!==null&&v.output_tokens!==null)amount=textCost(v.input_tokens,v.output_tokens,v.tool_calls||0);
     else if(v.stage==="speech"&&Number(v.characters)>0)amount=Number(v.characters)*.00012;
     else if(v.model==="none")amount=0;
     else amount=DAILY_LIMIT; // Unknown historical pricing must never mean free.
    }
    legacy.entries["legacy:"+(offset+i)]={amount,group:/discovery|shortlist|final|editorial/.test(v.stage)?"generation":"listening",settled:true};
   }
   if(!r.data||r.data.length<500)break;
  }
  const added=await this.db.from("gd_pipeline_cache").upsert({owner_id:this.owner,cache_key:this.key(),payload:legacy,expires_at:null},{onConflict:"owner_id,cache_key",ignoreDuplicates:true});if(added.error)throw added.error;
  const current=await this.db.from("gd_pipeline_cache").select("payload").eq("owner_id",this.owner).eq("cache_key",this.key()).single();if(current.error)throw current.error;return current.data.payload;
 }
 private async change(fn:(ledger:Ledger)=>void){
  for(let tries=0;tries<12;tries++){
   const ledger=await this.load(),revision=ledger.revision;fn(ledger);ledger.revision++;
   const r=await this.db.from("gd_pipeline_cache").update({payload:ledger}).eq("owner_id",this.owner).eq("cache_key",this.key()).eq("payload->>revision",String(revision)).select("cache_key");if(r.error)throw r.error;if(r.data?.length)return;
  }throw new CloudError("预算记录繁忙，请稍后重试。",503);
 }
 async reserve(amount:number,group:Entry["group"],id:string=randomUUID()){await this.change(l=>reserveEntry(l,id,amount,group));return id;}
 async settle(id:string,amount:number){if(!Number.isFinite(amount)||amount<0)throw Error("Invalid settlement");await this.change(l=>{const e=l.entries[id];if(!e)throw Error("Missing reservation");if(e.settled)return;e.amount=round(amount);e.settled=true;});}
 async status(){const t=totals(await this.load());return {date:this.day,limit:DAILY_LIMIT,generationLimit:GENERATION_LIMIT,safetyMargin:SAFETY_MARGIN,...t,remaining:Math.max(0,round(DAILY_LIMIT-SAFETY_MARGIN-t.used)),warning:t.used>=.40};}
}
