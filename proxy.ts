import {NextResponse,type NextRequest} from "next/server";
import {createServerClient} from "@supabase/ssr";
import {cloudEnabled,publicSupabaseConfig} from "./lib/cloud/config";
import {assertOwner,CloudError} from "./lib/cloud/auth-policy";
export async function proxy(request:NextRequest){
 if(!cloudEnabled()||request.nextUrl.pathname==="/login")return NextResponse.next();
 // APIs enforce authentication inside their handlers as well.
 if(request.nextUrl.pathname.startsWith("/api/")){
  if(request.nextUrl.pathname.startsWith("/api/cloud/"))return NextResponse.next();
  const target=request.nextUrl.clone();target.pathname="/api/cloud"+target.pathname;
  return NextResponse.rewrite(target);
 }
 let response=NextResponse.next({request});
 try{
  const {url,key}=publicSupabaseConfig();
  const client=createServerClient(url,key,{cookies:{getAll:()=>request.cookies.getAll(),setAll:values=>{
   for(const {name,value} of values)request.cookies.set(name,value);
   response=NextResponse.next({request});
   for(const {name,value,options} of values)response.cookies.set(name,value,options);
  }}});
  const {data,error}=await client.auth.getUser();assertOwner(error?null:data.user);
  response.headers.set("Cache-Control","private, no-store");return response;
 }catch(e){
  const rejected=e instanceof CloudError&&e.status===401?NextResponse.redirect(new URL("/login",request.url)):new NextResponse("网站尚未配置完成，或此账号没有访问权限。",{status:e instanceof CloudError?e.status:503});
  for(const cookie of response.cookies.getAll())rejected.cookies.set(cookie);
  rejected.headers.set("Cache-Control","no-store");return rejected;
 }
}
export const config={matcher:["/","/login","/migration","/api/:path*"]};
