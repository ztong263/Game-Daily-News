import "server-only";
import {createServerClient} from "@supabase/ssr";
import {createClient} from "@supabase/supabase-js";
import {cookies} from "next/headers";
import {publicSupabaseConfig} from "./config";
import {assertOwner,CloudError} from "./auth-policy";
export async function authenticatedCloud(){
 const {url,key}=publicSupabaseConfig();const jar=await cookies();
 const session=createServerClient(url,key,{cookies:{getAll:()=>jar.getAll(),setAll:values=>{for(const {name,value,options} of values)jar.set(name,value,options);}}});
 const {data,error}=await session.auth.getUser();
 const ownerId=assertOwner(error?null:data.user);
 const secret=process.env.SUPABASE_SECRET_KEY;
 if(!secret)throw new CloudError("云端存储尚未配置完成。",503);
 return {ownerId,db:createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})};
}
