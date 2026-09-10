import {readdir,readFile} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {CloudError} from "./auth-policy";
import {CloudPipeline} from "./pipeline";
import {CloudMedia,AUDIO_BUCKET} from "./media";
import {canonical} from "../server/brief-versions";
import {defaultPreferences,preferencesSchema} from "../editorial/preferences";
import {fingerprint} from "./fingerprint";
const ARCHIVE_BUCKET="game-daily-archive";
const digest=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
export async function migrateLocalBatch(db:SupabaseClient,ownerId:string,offset:number){
 if(process.env.VERCEL||process.env.NODE_ENV!=="development")throw new CloudError("本地迁移仅在开发电脑上可用。",403);
 const root=path.resolve(process.env.DATA_DIR||"./data");
 const files:string[]=[];
 async function walk(dir:string){for(const e of await readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())continue;const f=path.join(dir,e.name);if(e.isDirectory())await walk(f);else if(!/\.(lock|tmp)$/.test(e.name))files.push(f);}}
 await walk(root);files.sort();
 const cache=new CloudPipeline(db,ownerId,"local-migration",defaultPreferences),media=new CloudMedia(db,ownerId);
 let verified=0;
 for(const file of files.slice(offset,offset+5)){
  const relative=path.relative(root,file).replace(/\\/g,"/");
  const bytes=await readFile(file),hash=digest(bytes),key="local-archive:"+fingerprint(relative)+":"+hash;
  if(await cache.get(key)){verified++;continue;}
  const objectPath=ownerId+"/"+fingerprint(relative)+"/"+hash;
  const upload=await db.storage.from(ARCHIVE_BUCKET).upload(objectPath,bytes,{contentType:"application/octet-stream",upsert:false});
  if(upload.error&&!String(upload.error.message).toLowerCase().includes("exist"))throw new CloudError("备份上传失败，本地文件保留。",503);
  const download=await db.storage.from(ARCHIVE_BUCKET).download(objectPath);
  if(download.error||!download.data)throw new CloudError("云端备份读取失败（"+String(download.error?.name||"empty")+"）。",503);
  if(digest(Buffer.from(await download.data.arrayBuffer()))!==hash)throw new CloudError("云端备份字节校验失败。",503);
  if(relative.endsWith(".json")){
   const value=JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/,""));
   if(/^\d{4}-\d{2}-\d{2}\.json$/.test(relative)){
    for(const raw of [value.brief,...(value.versions||[])].filter(Boolean)){
     const b=canonical(raw);const existing=await db.from("gd_briefs").select("payload").eq("owner_id",ownerId).eq("brief_date",b.date).eq("version",b.version).maybeSingle();if(existing.error)throw existing.error;
     if(existing.data){if(fingerprint(canonical(existing.data.payload))!==fingerprint(b))throw new CloudError("相同早报版本内容不同，已保留双方数据。",409);}
     else{const result=await db.rpc("gd_import_brief",{p_owner:ownerId,p_payload:b,p_activate:false,p_key:"local-copy:"+fingerprint([b.date,b.version]),p_hash:fingerprint(b)});if(result.error)throw result.error;}
    }
   }else if(relative==="preferences.json"){
    const settings=preferencesSchema.parse(value);const saved=await db.from("gd_preferences").upsert({owner_id:ownerId,settings},{onConflict:"owner_id",ignoreDuplicates:true});if(saved.error)throw saved.error;
   }else if(/^speech\/[0-9a-f]{64}\.json$/.test(relative)){
    const audioKey=path.basename(relative,".json"),audioBytes=await readFile(path.join(root,"speech",audioKey+".mp3"));
    const existing=await db.from("gd_audio").select("cache_key").eq("owner_id",ownerId).eq("cache_key",audioKey).maybeSingle();if(existing.error)throw existing.error;
    if(!existing.data){
     const audioPath=ownerId+"/"+audioKey+".mp3";
     const up=await db.storage.from(AUDIO_BUCKET).upload(audioPath,audioBytes,{contentType:"audio/mpeg",upsert:false});if(up.error&&!String(up.error.message).toLowerCase().includes("exist"))throw up.error;
     const check=await db.storage.from(AUDIO_BUCKET).download(audioPath);if(check.error||!check.data||digest(Buffer.from(await check.data.arrayBuffer()))!==digest(audioBytes))throw new CloudError("音频校验不一致，本地原件已保留。",409);
     const saved=await db.from("gd_audio").upsert({owner_id:ownerId,cache_key:audioKey,object_path:audioPath,metadata:value},{onConflict:"owner_id,cache_key",ignoreDuplicates:true});if(saved.error)throw saved.error;
    }
    await media.usage("local-speech:"+audioKey,"speech",value.model||"unknown",value.ttsUsage||null,{...value,origin:"local-migration"});
   }else if(relative.startsWith("telemetry/voice/")){
    await media.usage("voice:"+value.runId+":"+value.responseId,"realtime",value.model||"unknown",value.usage||null,{...value,origin:"local-migration"});
   }else if(/^research-[0-9a-f]{64}\.json$/.test(relative)){
    const cacheKey="research:"+relative.slice(9,-5);if(!(await cache.get(cacheKey)))await cache.put(cacheKey,value,new Date(value.createdAt+86400000).toISOString());
   }else if(/^speech\/[0-9a-f]{64}\.translation\.json$/.test(relative)){
    await cache.put("translation:"+path.basename(relative,".translation.json"),value);
   }
  }else if(relative==="telemetry/editorial.jsonl"){
   for(const line of bytes.toString("utf8").split(/\r?\n/).filter(Boolean)){
    const r=JSON.parse(line);await media.usage(r.responseId||"local-editorial:"+fingerprint(r),r.stage||"editorial",r.model||"unknown",r.inputTokens===null||r.inputTokens===undefined?null:{input_tokens:r.inputTokens,output_tokens:r.outputTokens},{...r,origin:"local-migration"},r.toolCalls||0);
   }
  }
  await cache.put(key,{relative,hash,bytes:bytes.length,objectPath,verified:true});verified++;
 }
 return {total:files.length,processed:Math.min(offset+verified,files.length),done:offset+verified>=files.length};
}
