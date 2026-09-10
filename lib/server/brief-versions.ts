import {mkdir,readFile,writeFile,rename} from "node:fs/promises";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {briefSchema,type MorningBrief} from "../brief/schema";
import {acquireLock} from "./lock";
import {pipelineBudget} from "../editorial/budget";
import {normalizeImport} from "../brief/normalize-import";
export const importSchema=z.object({brief:briefSchema,activate:z.boolean().default(false),idempotencyKey:z.string().min(1).max(200)});
export class BriefError extends Error {constructor(message:string,public status=409){super(message);}}
export const briefRoot=()=>path.resolve(process.env.DATA_DIR||"./data",pipelineBudget().mode==="preview"?"preview":".");
export function canonical(brief:MorningBrief):MorningBrief{return briefSchema.parse({...brief,sourceType:brief.sourceType||"generated",createdAt:brief.createdAt||brief.generatedAt});}
type Document={date:string;status:string;stage:string;attempts:number;updatedAt:number;brief?:MorningBrief;versions?:MorningBrief[];imports?:Record<string,{hash:string;id:string}>;error?:string};
export async function readVersions(date:string):Promise<Document>{
 z.iso.date().parse(date);
 try{return JSON.parse(await readFile(path.join(briefRoot(),date+".json"),"utf8"));}
 catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;return {date,status:"missing",stage:"等待准备",attempts:0,updatedAt:Date.now()};}
}
export function versionsOf(doc:Document){
 const versions=(doc.versions||[]).map(canonical);
 if(doc.brief&&!versions.some(b=>b.id===doc.brief!.id&&b.version===doc.brief!.version))versions.push(canonical(doc.brief));
 return versions;
}
export async function writeVersions(doc:Document){
 await mkdir(briefRoot(),{recursive:true});const file=path.join(briefRoot(),doc.date+".json"),temp=file+"."+randomUUID()+".tmp";
 await writeFile(temp,JSON.stringify(doc));await rename(temp,file);
}
async function locked<T>(date:string,fn:()=>Promise<T>){
 await mkdir(briefRoot(),{recursive:true});const release=await acquireLock(path.join(briefRoot(),date+".lock"));
 if(!release)throw new BriefError("这一天的早报正在处理，请稍后重试。");
 try{return await fn();}finally{await release();}
}
export async function importBrief(input:unknown){
 const envelope=input&&typeof input==="object"?input as Record<string,unknown>:null;
 const request=importSchema.parse(envelope?{...envelope,brief:normalizeImport(envelope.brief)}:input);
 if(request.brief.sourceType==="generated")throw new BriefError("导入来源必须为 imported_chatgpt 或 manual。",400);
 return locked(request.brief.date,async()=>{
  const doc=await readVersions(request.brief.date);
  const key=createHash("sha256").update(request.idempotencyKey).digest("hex");
  const hash=createHash("sha256").update(JSON.stringify({brief:request.brief,activate:request.activate})).digest("hex");
  const previous=doc.imports?.[key];
  if(previous){if(previous.hash!==hash)throw new BriefError("相同请求标识不能用于不同内容。");return {ok:true,briefId:previous.id,date:doc.date,active:doc.brief?.id===previous.id};}
  const brief=canonical({...request.brief,id:"brief_"+doc.date+"_"+randomUUID(),version:randomUUID(),sourceType:request.brief.sourceType||"imported_chatgpt",createdAt:new Date().toISOString()});
  const versions=versionsOf(doc);versions.push(brief);
  // The first stored version is active; later imports require an explicit activation choice.
  const active=request.activate||!doc.brief;
  await writeVersions({...doc,versions,imports:{...doc.imports,[key]:{hash,id:brief.id}},...(active?{brief,status:"ready",stage:"早报已准备好",error:undefined}:{}),updatedAt:Date.now()});
  return {ok:true,briefId:brief.id,date:doc.date,active};
 });
}
export async function activateBrief(date:string,id:string,version:string){
 z.iso.date().parse(date);
 return locked(date,async()=>{const doc=await readVersions(date);const versions=versionsOf(doc);const brief=versions.find(b=>b.id===id&&b.version===version);
 if(!brief)throw new BriefError("找不到这个版本。",404);
 await writeVersions({...doc,versions,brief,status:"ready",stage:"早报已准备好",error:undefined,updatedAt:Date.now()});
 return {ok:true,briefId:brief.id,date,active:true};});
}
