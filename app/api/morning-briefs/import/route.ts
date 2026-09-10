import {importBrief,BriefError} from "@/lib/server/brief-versions";
import {publishAccess} from "@/lib/server/publish-access";
import {z} from "zod";
export const runtime="nodejs";
export async function POST(request:Request){
 try{publishAccess(request);const text=await request.text();if(Buffer.byteLength(text)>1_000_000)return Response.json({error:"内容超过1MB限制。"},{status:413});
 let data;try{data=JSON.parse(text);}catch{return Response.json({error:"JSON 格式错误，原内容未修改。"},{status:400});}
 return Response.json(await importBrief({...data,idempotencyKey:request.headers.get("idempotency-key")||data.idempotencyKey}));
 }catch(e){if(e instanceof z.ZodError)return Response.json({error:"导入未完成，请补充以下字段；粘贴内容已保留。",issues:e.issues.map(i=>({path:i.path,message:(typeof i.path[2]==="number"?`第${i.path[2]+1}条资讯：`:"")+`请检查 ${String(i.path.at(-1))} 字段，内容缺失或格式不符合要求。`}))},{status:400});return Response.json({error:e instanceof BriefError?e.message:"导入失败，已有内容未修改。"},{status:e instanceof BriefError?e.status:500});}
}
