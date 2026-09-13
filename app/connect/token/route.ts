import {GrantStore,publishConfig,publishDb} from "@/lib/publish/store";
import {limitedBody} from "@/lib/publish/protocol";
import {exchange} from "@/lib/publish/exchange";
export const runtime="nodejs";
export async function POST(request:Request){
 try{
  const origin=publishConfig();
  if(!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))return Response.json({error:"invalid_request"},{status:400});
  const result=await exchange(new URLSearchParams(await limitedBody(request,8192)),origin,new GrantStore(publishDb()));
  return Response.json(result,{headers:{"Cache-Control":"no-store",Pragma:"no-cache"}});
 }catch(e){const reason=e instanceof Error?e.message:"";const known=["invalid_grant","invalid_scope","unsupported_grant_type"].includes(reason);return Response.json({error:known?reason:"temporarily_unavailable"},{status:known?400:503,headers:{"Cache-Control":"no-store"}});}
}
