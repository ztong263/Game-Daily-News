import {authenticatedCloud} from "@/lib/cloud/server";
import {GrantStore} from "@/lib/publish/store";
import {assertSameOrigin} from "@/lib/cloud/auth-policy";
export async function GET(){
 try{await authenticatedCloud();return new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>连接管理</title><body><h1>ChatGPT 发布连接</h1><p>撤销后，ChatGPT 需要重新登录授权才能发布。已有早报不会删除。</p><form method="post"><button>撤销全部发布授权</button></form><p><a href="/">返回早报</a></p></body></html>',{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Content-Security-Policy":"frame-ancestors 'none'; form-action 'self'"}});}catch{return new Response("请先登录网站再打开此页面。",{status:401});}
}
export async function POST(request:Request){try{assertSameOrigin(request);const {ownerId,db}=await authenticatedCloud();await new GrantStore(db).revoke(ownerId);return new Response("发布授权已撤销。已有早报未修改。",{headers:{"Cache-Control":"no-store"}});}catch{return new Response("撤销未完成，请先登录后重试。",{status:403});}}
