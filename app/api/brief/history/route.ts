import { z } from "zod";
import { localAccess } from "@/lib/server/access";
import { historyDates, status, today } from "@/lib/server/store";
export const runtime="nodejs";
export async function GET(request: Request) {
  try {localAccess(request);} catch {return Response.json({error:"无法访问历史早报"},{status:403});}
  const date=new URL(request.url).searchParams.get("date");
  if(date!==null&&!z.iso.date().safeParse(date).success)return Response.json({error:"日期无效"},{status:400});
  try {
    if(!date)return Response.json({dates:await historyDates(),today:today()},{headers:{"Cache-Control":"no-store"}});
    const job=await status(date);
    if(!job.brief)return Response.json({error:"这一天没有已保存的早报"},{status:404});
    return Response.json({...job,status:"ready",error:undefined},{headers:{"Cache-Control":"no-store"}});
  } catch {return Response.json({error:"无法读取历史早报"},{status:500});}
}
