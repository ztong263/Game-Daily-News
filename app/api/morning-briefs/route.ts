import {readVersions,versionsOf,activateBrief,BriefError} from "@/lib/server/brief-versions";
import {localAccess} from "@/lib/server/access";
import {publishAccess} from "@/lib/server/publish-access";
import {z} from "zod";
export async function GET(request:Request){try{localAccess(request);const date=z.iso.date().parse(new URL(request.url).searchParams.get("date"));const doc=await readVersions(date);
 return Response.json({versions:versionsOf(doc).map(b=>({id:b.id,version:b.version,date:b.date,title:b.title,sourceType:b.sourceType,createdAt:b.createdAt,active:doc.brief?.id===b.id&&doc.brief?.version===b.version}))},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return Response.json({error:"无法读取版本。"},{status:e instanceof z.ZodError?400:403});}}
export async function POST(request:Request){try{publishAccess(request);const data=z.object({date:z.iso.date(),id:z.string().min(1),version:z.string().min(1)}).parse(await request.json());return Response.json(await activateBrief(data.date,data.id,data.version));}
 catch(e){return Response.json({error:e instanceof BriefError?e.message:"切换失败，请检查请求。"},{status:e instanceof BriefError?e.status:400});}}
