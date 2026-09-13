import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {digest,secret,tokenOwner} from "./protocol";
export type Grant={clientId:string;resource:string;scope:string;redirect?:string;challenge?:string};
export function publishConfig(){
 if(process.env.ENABLE_CHATGPT_MCP_PUBLISH!=="true")throw Error("publish_disabled");
 const origin=process.env.APP_ORIGIN;
 if(!origin||new URL(origin).origin!==origin||(!origin.startsWith("https://")&&!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)))throw Error("publish_not_configured");
 return origin;
}
export function publishDb(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key)throw Error("publish_not_configured");
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
// Only the new oauth namespace is read. Credentials are hashed, never stored in plaintext.
export class GrantStore{
 constructor(private db:SupabaseClient){}
 async issue(owner:string,kind:string,grant:Grant,seconds:number){
  const token=secret(owner);const {error}=await this.db.from("gd_pipeline_cache").insert({owner_id:owner,cache_key:"oauth:"+kind+":"+digest(token),payload:grant,expires_at:new Date(Date.now()+seconds*1000).toISOString()});
  if(error)throw Error("storage_unavailable");return token;
 }
 async read(token:string,kind:string){
  const owner=tokenOwner(token);const {data,error}=await this.db.from("gd_pipeline_cache").select("payload").eq("owner_id",owner).eq("cache_key","oauth:"+kind+":"+digest(token)).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(error)throw Error("storage_unavailable");if(!data)throw Error("invalid_grant");return {owner,grant:data.payload as Grant};
 }
 async consume(token:string,kind:string){
  const owner=tokenOwner(token);const {data,error}=await this.db.from("gd_pipeline_cache").delete().eq("owner_id",owner).eq("cache_key","oauth:"+kind+":"+digest(token)).gt("expires_at",new Date().toISOString()).select("cache_key");
  if(error)throw Error("storage_unavailable");if(data?.length!==1)throw Error("invalid_grant");
 }
 async revoke(owner:string){
  const {error}=await this.db.from("gd_pipeline_cache").delete().eq("owner_id",owner).like("cache_key","oauth:%");if(error)throw Error("storage_unavailable");
 }
 async reservePublish(owner:string){
  const minute=Math.floor(Date.now()/60000);
  for(let slot=0;slot<30;slot++){
   const {error}=await this.db.from("gd_pipeline_cache").insert({owner_id:owner,cache_key:`oauth:rate:${minute}:${slot}`,payload:{},expires_at:new Date((minute+2)*60000).toISOString()});
   if(!error)return;
   if(error.code!=="23505")throw Error("storage_unavailable");
  }
  throw Error("rate_limited");
 }
}
