import {randomBytes,timingSafeEqual} from "node:crypto";
import {cookies} from "next/headers";
import {authenticatedCloud} from "@/lib/cloud/server";
import {CloudError} from "@/lib/cloud/auth-policy";
import {authorizationInput,limitedBody} from "@/lib/publish/protocol";
import {GrantStore,publishConfig} from "@/lib/publish/store";
export const runtime="nodejs";
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export async function GET(request:Request){
 try{
  const origin=publishConfig();authorizationInput(new URL(request.url).searchParams,origin);
  try{await authenticatedCloud();}catch(e){if(e instanceof CloudError&&e.status===401)return Response.redirect(origin+"/login?next="+encodeURIComponent(new URL(request.url).pathname+new URL(request.url).search));throw e;}
  const csrf=randomBytes(32).toString("hex");const jar=await cookies();jar.set("publish-consent",csrf,{httpOnly:true,secure:origin.startsWith("https:"),sameSite:"lax",path:"/connect/authorize",maxAge:600});
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>连接游戏早报</title><body style="font:18px system-ui;max-width:520px;margin:12vh auto;padding:24px;background:#faf9f6;color:#27392c"><h1>允许 ChatGPT 发布早报？</h1><p>允许将准备好的早报保存到你的账号，并设为当前播放版本。已有版本会保留。</p><p>此连接不能读取历史早报、账户资料或密钥，也不会自动搜索或产生语音费用。</p><form method="post" action="${escape(new URL(request.url).pathname+new URL(request.url).search)}"><input type="hidden" name="csrf" value="${csrf}"><button name="decision" value="allow">允许连接</button> <button name="decision" value="deny">取消</button></form><p>之后可在网站的 <a href="/connect">连接管理</a> 撤销授权。</p></body></html>`,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
 }catch{return new Response("无法授权：请确认已启用发布功能，并从 ChatGPT 重新连接。",{status:400});}
}
export async function POST(request:Request){
 try{
  const origin=publishConfig();if(request.headers.get("origin")!==origin)throw Error("invalid_origin");
  const input=authorizationInput(new URL(request.url).searchParams,origin);
  const form=new URLSearchParams(await limitedBody(request,2048));const jar=await cookies();const expected=jar.get("publish-consent")?.value||"",actual=form.get("csrf")||"";
  if(!expected||actual.length!==expected.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))throw Error("invalid_csrf");
  const {ownerId,db}=await authenticatedCloud();jar.delete({name:"publish-consent",path:"/connect/authorize"});
  const redirect=new URL(input.redirect);redirect.searchParams.set("state",input.state);redirect.searchParams.set("iss",origin);
  if(form.get("decision")==="allow")redirect.searchParams.set("code",await new GrantStore(db).issue(ownerId,"code",input,300));else redirect.searchParams.set("error","access_denied");
  return new Response(null,{status:303,headers:{Location:redirect.href,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
 }catch{return new Response("授权未完成，请返回 ChatGPT 重新连接。",{status:400});}
}
