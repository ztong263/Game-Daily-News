import "server-only";
import {z} from "zod";
import {authenticatedCloud} from "./server";
import {assertSameOrigin,CloudError} from "./auth-policy";
import {CloudRepository} from "./repository";
import {dateInZone} from "../brief/schema";
import {CloudMedia} from "./media";
import {cloudSession,cloudSearch,cloudVoiceUsage} from "./live";
import {startGeneration,advanceGeneration} from "./generation";
import {after} from "next/server";
import {migrateLocalBatch} from "./local-migration";
export async function cloudRequest(request:Request){
 try{
  assertSameOrigin(request);
  const {db,ownerId}=await authenticatedCloud();const repo=new CloudRepository(db,ownerId);
  const url=new URL(request.url),route=url.pathname.replace(/^\/api\/cloud(?=\/)/,""),method=request.method;
  const today=dateInZone(new Date(),process.env.BRIEF_TIMEZONE||"Australia/Sydney");
  const media=new CloudMedia(db,ownerId);
  if(route==="/api/migrate-local"&&method==="POST"){
   if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname))throw new CloudError("仅允许在本机迁移。",403);
   const {offset}=z.object({offset:z.number().int().nonnegative()}).parse(await request.json());
   return Response.json(await migrateLocalBatch(db,ownerId,offset));
  }
  if(route==="/api/brief/today"&&method==="POST"){
   const accepted=await startGeneration(db,ownerId,today);
   after(async()=>{await advanceGeneration(db,ownerId,today);});
   return Response.json(accepted,{status:202});
  }
  if(route==="/api/brief/advance"&&method==="POST"){
   const {date}=z.object({date:z.iso.date()}).parse(await request.json());
   return Response.json(await advanceGeneration(db,ownerId,date),{headers:{"Cache-Control":"no-store"}});
  }
  if(route==="/api/speech"&&method==="GET")return await media.download(url.searchParams.get("key"));
  if(route.startsWith("/api/realtime/")&&method==="POST"){
   const text=await request.text();if(text.length>150000)throw new CloudError("请求内容过大。",413);
   const input=JSON.parse(text);
   if(route==="/api/realtime/session")return await cloudSession(media,input);
   if(route==="/api/realtime/search")return Response.json(await cloudSearch(media,input),{headers:{"Cache-Control":"no-store"}});
   if(route==="/api/realtime/usage")return Response.json(await cloudVoiceUsage(media,input),{headers:{"Cache-Control":"no-store"}});
  }
  let result:unknown;
  if(route==="/api/speech"&&method==="POST")result=await media.speech(await request.json());
  else if(route==="/api/brief/today"&&method==="GET"){
   const job=await repo.status(today);result={...job,fallback:job.brief?null:await repo.latest()};
  }else if(route==="/api/brief/history"&&method==="GET"){
   const date=url.searchParams.get("date");
   if(date){z.iso.date().parse(date);const job=await repo.status(date);if(!job.brief)throw new CloudError("这一天没有已保存的早报。",404);result=job;}
   else result={dates:await repo.dates(),today};
  }else if(route==="/api/morning-briefs"&&method==="GET"){
   result={versions:await repo.versions(z.iso.date().parse(url.searchParams.get("date")))};
  }else if(route==="/api/settings"&&method==="GET")result=await repo.preferences();
  else if(route==="/api/settings"&&method==="PUT")result=await repo.savePreferences(await request.json());
  else if(route==="/api/morning-briefs"&&method==="POST"){
   const data=z.object({date:z.iso.date(),id:z.string().min(1),version:z.string().min(1)}).parse(await request.json());
   result=await repo.activate(data.date,data.id,data.version);
  }else if(route==="/api/morning-briefs/import"&&method==="POST"){
   const text=await request.text();if(Buffer.byteLength(text)>1_000_000)throw new CloudError("内容超过1MB限制。",413);
   const data=JSON.parse(text);result=await repo.import({...data,idempotencyKey:request.headers.get("idempotency-key")||data.idempotencyKey});
  }else throw new CloudError("接口不存在或不支持此操作。",404);
  return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){
  if(e instanceof z.ZodError)return Response.json({error:"内容格式不正确。",issues:e.issues.map(i=>({path:i.path,message:i.message}))},{status:400});
  return Response.json({error:e instanceof CloudError?e.message:e instanceof SyntaxError?"JSON 格式错误。":"云端请求未完成，请检查配置或稍后重试。"},{status:e instanceof CloudError?e.status:e instanceof SyntaxError?400:503,headers:{"Cache-Control":"no-store"}});
 }
}
