import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {z} from "zod";
import {localAccess} from "@/lib/server/access";
const count=z.number().int().nonnegative();
const schema=z.object({runId:z.string().uuid(),date:z.iso.date(),briefId:z.string().max(200),responseId:z.string().min(1).max(200),status:z.string().max(40),usage:z.object({total_tokens:count,input_tokens:count,output_tokens:count}).passthrough()});
export async function POST(request:Request){
 try{localAccess(request);}catch{return Response.json({error:"Forbidden"},{status:403});}
 try{const text=await request.text();if(text.length>20000)return Response.json({error:"Too large"},{status:413});const data=schema.parse(JSON.parse(text));
 const dir=path.resolve(process.env.DATA_DIR||"./data","telemetry","voice");await mkdir(dir,{recursive:true});
 const id=createHash("sha256").update(data.runId+":"+data.responseId).digest("hex");
 try{await writeFile(path.join(dir,id+".json"),JSON.stringify({...data,model:process.env.REALTIME_MODEL||"gpt-realtime-2.1",receivedAt:new Date().toISOString(),origin:"browser-realtime-event"}),{flag:"wx"});}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;}
 return Response.json({ok:true});
 }catch{return Response.json({error:"Usage recording failed"},{status:400});}
}
