import {readFile,readdir} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {loadEnvConfig} from "@next/env";
import {createClient} from "@supabase/supabase-js";
import {canonical} from "../lib/server/brief-versions";
import type {MorningBrief} from "../lib/brief/schema";
import {z} from "zod";

// Only aggregate results are printed. Credentials and payloads stay inside this process.
function stable(value:unknown):string{
 if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+":"+stable(v)).join(",")+"}";
 return JSON.stringify(value);
}
const hash=(value:unknown)=>createHash("sha256").update(stable(value)).digest("hex");
async function main(){
 loadEnvConfig(process.cwd(),true,{info(){},error(){}});
 const root=path.resolve(process.env.DATA_DIR||"./data");
 const files=(await readdir(root)).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
 const records:MorningBrief[]=[];const seen=new Map<string,string>();
 for(const file of files){
  const doc=JSON.parse((await readFile(path.join(root,file),"utf8")).replace(/^\uFEFF/,""));
  // Put the current version first, so an empty date receives the same active version.
  for(const input of [doc.brief,...(doc.versions||[])].filter(Boolean)){
   const brief=canonical(input);if(brief.date!==file.slice(0,10))throw Error("ARCHIVE_DATE_MISMATCH");
   const key=brief.date+":"+brief.version,digest=hash(brief);
   if(seen.has(key)){if(seen.get(key)!==digest)throw Error("LOCAL_VERSION_CONFLICT");continue;}
   seen.set(key,digest);records.push(brief);
  }
 }
 if(process.argv.includes("--dry-run")){console.log(JSON.stringify({validDates:new Set(records.map(b=>b.date)).size,validVersions:records.length,cloudWrites:0}));return;}
 const owner=process.argv[2];if(!/^[0-9a-f-]{36}$/.test(owner||""))throw Error("CONFIRMED_OWNER_REQUIRED");
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY;
 if(!url||!secret)throw Error("CONFIGURATION_MISSING");
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 // Preflight every destination version before making any writes. Never overwrite a conflict.
 const missing:MorningBrief[]=[];let alreadyPresent=0;
 for(const brief of records){
  const {data,error}=await db.from("gd_briefs").select("payload").eq("owner_id",owner).eq("brief_date",brief.date).eq("version",brief.version).maybeSingle();
  if(error)throw Error("CLOUD_PREFLIGHT_FAILED");
  if(data){if(hash(canonical(data.payload))!==hash(brief))throw Error("CLOUD_VERSION_CONFLICT");alreadyPresent++;}else missing.push(brief);
 }
 for(const brief of missing){
  const {error}=await db.rpc("gd_import_brief",{p_owner:owner,p_payload:brief,p_activate:false,p_key:"local-migration:"+hash([brief.date,brief.version]),p_hash:hash(brief)});
  if(error)throw Error("IMPORT_FAILED_SAFE_TO_RERUN");
 }
 let verified=0;
 for(const brief of records){
  const {data,error}=await db.from("gd_briefs").select("payload").eq("owner_id",owner).eq("brief_date",brief.date).eq("version",brief.version).single();
  if(error||hash(canonical(data.payload))!==hash(brief))throw Error("VERIFICATION_FAILED");verified++;
 }
 console.log(JSON.stringify({dates:new Set(records.map(b=>b.date)).size,importedVersions:missing.length,alreadyPresent,verifiedVersions:verified,localFilesChanged:0}));
}
main().catch(error=>{if(error instanceof z.ZodError){console.error(JSON.stringify({error:"SCHEMA_VALIDATION",fields:error.issues.map(i=>i.path.join("."))}));}else{const message=error instanceof Error?error.message:"";console.error(/^[A-Z_]+$/.test(message)?message:JSON.stringify({error:"MIGRATION_FAILED",type:error?.name,code:error?.code,locations:error?.stack?.split(String.fromCharCode(10)).slice(1,4)}));}process.exitCode=1;});
