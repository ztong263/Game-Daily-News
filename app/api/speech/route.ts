import {mkdir,readFile,writeFile,rename} from "node:fs/promises";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {localAccess} from "@/lib/server/access";
import {status} from "@/lib/server/store";
import {paragraphs} from "@/lib/brief/schema";
import {api} from "@/lib/server/openai";
import {acquireLock} from "@/lib/server/lock";
import {pipelineBudget} from "@/lib/editorial/budget";
const root=()=>path.resolve(process.env.DATA_DIR||"./data","speech");
const schema=z.object({date:z.iso.date(),version:z.string(),index:z.number().int().nonnegative(),language:z.enum(["zh","en"])});
export async function POST(request:Request){
 try{localAccess(request);}catch{return Response.json({error:"Forbidden"},{status:403});}
 try{
 const input=schema.parse(await request.json());const job=await status(input.date);
 if(!job.brief||job.brief.version!==input.version)return Response.json({error:"早报版本已变化，请刷新。"},{status:409});
 const paragraph=paragraphs(job.brief)[input.index];if(!paragraph)return Response.json({error:"段落不存在"},{status:400});
 const model=process.env.TTS_MODEL||"gpt-4o-mini-tts",voice=process.env.TTS_VOICE||"marin",translationModel=process.env.TRANSLATION_MODEL||"gpt-5.4-mini";
 const key=createHash("sha256").update(JSON.stringify({version:input.version,text:paragraph.text,language:input.language,model,voice,translationModel,v:1})).digest("hex");
 const dir=root();await mkdir(dir,{recursive:true});const audio=path.join(dir,key+".mp3"),metadata=path.join(dir,key+".json");
 const cached=async()=>{try{const meta=JSON.parse(await readFile(metadata,"utf8"));await readFile(audio);return Response.json({url:"/api/speech?key="+key,text:meta.text,cacheHit:true});}catch{return null;}};
 const hit=await cached();if(hit)return hit;
 if(pipelineBudget().offline)return Response.json({error:"离线模式只播放已缓存的音频。"},{status:409});
 const release=await acquireLock(path.join(dir,key+".lock"));if(!release)return Response.json({error:"音频正在准备，请稍后点击继续。"},{status:409});
 try{
 const hit=await cached();if(hit)return hit;
 let text=paragraph.text;let translationUsage:unknown=null;
 const translationFile=path.join(dir,key+".translation.json");
 if(input.language==="en"){
  try{const saved=JSON.parse(await readFile(translationFile,"utf8"));text=saved.text;translationUsage=saved.usage;}
  catch{const translated=await api().responses.create({model:translationModel,max_output_tokens:2000,instructions:"Translate this prepared broadcast paragraph into natural spoken English. Preserve facts, caveats and examples. Add nothing. Return only the translation.",input:text});if(translated.status!=="completed"||!translated.output_text.trim())throw Error("Translation incomplete");text=translated.output_text;translationUsage=translated.usage;await writeFile(translationFile,JSON.stringify({text,usage:translationUsage}));}
 }
 const response=await api().audio.speech.create({model,voice:voice as "marin",input:text,response_format:"mp3",instructions:"Read exactly the provided script in a warm, clear conversational presenter voice. Keep a natural pace; do not add or omit content."});
 const bytes=Buffer.from(await response.arrayBuffer());const temp=audio+"."+randomUUID()+".tmp";await writeFile(temp,bytes);await rename(temp,audio);
 await writeFile(metadata,JSON.stringify({date:input.date,version:input.version,language:input.language,index:input.index,text,model,voice,characters:[...text].length,bytes:bytes.length,createdAt:new Date().toISOString(),translationModel,translationUsage,ttsUsage:null,usageNote:"Binary speech endpoint does not expose token usage; do not treat missing usage as zero."}));
 return Response.json({url:"/api/speech?key="+key,text,cacheHit:false});
 }finally{await release();}
 }catch{return Response.json({error:"语音准备失败，请稍后重试；已保存的音频会复用。"},{status:500});}
}
export async function GET(request:Request){try{localAccess(request);const key=z.string().regex(/^[a-f0-9]{64}$/).parse(new URL(request.url).searchParams.get("key"));const bytes=await readFile(path.join(root(),key+".mp3"));return new Response(bytes,{headers:{"Content-Type":"audio/mpeg","Cache-Control":"private, max-age=31536000, immutable"}});}catch{return Response.json({error:"音频不存在"},{status:404});}}
