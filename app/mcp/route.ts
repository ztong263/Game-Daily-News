import {handleMcp} from "@/lib/publish/mcp";
import {GrantStore,publishConfig,publishDb} from "@/lib/publish/store";
import {limitedBody,scope,clientId} from "@/lib/publish/protocol";
import {CloudRepository} from "@/lib/cloud/repository";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request){
 let origin:string;
 try{origin=publishConfig();}catch{return Response.json({error:"publish_disabled_or_not_configured"},{status:503});}
 if(request.headers.has("origin")&&![origin,"https://chatgpt.com"].includes(request.headers.get("origin")!))return new Response(null,{status:403});
 let body;
 try{body=JSON.parse(await limitedBody(request));}catch(e){return Response.json({error:e instanceof Error&&e.message==="payload_too_large"?"payload_too_large":"invalid_json"},{status:e instanceof Error&&e.message==="payload_too_large"?413:400});}
 // Discovery exposes only public schemas. Every other request requires a scoped token.
 if(body&&["initialize","notifications/initialized","tools/list","ping"].includes(body.method))return handleMcp(request,body,async()=>{throw Error("unauthorized");});
 try{
  const token=request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1]||"";
  const db=publishDb();const {owner,grant}=await new GrantStore(db).read(token,"access");
  if(grant.resource!==origin+"/mcp"||grant.scope!==scope||grant.clientId!==clientId)throw Error("invalid_grant");
  await new GrantStore(db).reservePublish(owner);
  const response=await handleMcp(request,body,input=>new CloudRepository(db,owner).import(input,"chatgpt_publish"));response.headers.set("Cache-Control","no-store");return response;
 }catch(e){
  if(e instanceof Error&&e.message==="rate_limited")return Response.json({error:"rate_limited"},{status:429,headers:{"Retry-After":"60","Cache-Control":"no-store"}});
  if(e instanceof Error&&["storage_unavailable","publish_not_configured"].includes(e.message))return Response.json({error:"temporarily_unavailable"},{status:503});
  return Response.json({error:"unauthorized"},{status:401,headers:{"Cache-Control":"no-store","WWW-Authenticate":`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${scope}"`}});
 }
}
export function GET(){return new Response(null,{status:405,headers:{Allow:"POST"}});}
