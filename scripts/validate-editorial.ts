import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateBrief } from "../lib/editorial/generate";
import { dateInZone } from "../lib/brief/schema";
import { acquireLock } from "../lib/server/lock";
async function main() {
if(!process.argv.includes("--regenerate"))throw Error("Explicit --regenerate is required for paid maintenance generation");
const root=path.resolve(process.env.DATA_DIR || "./data");
const timezone=process.env.BRIEF_TIMEZONE || "Australia/Sydney";
const date=dateInZone(new Date(),timezone);
await mkdir(root,{recursive:true});
const release=await acquireLock(path.join(root,date+".lock"));
if(!release)throw Error("Another generation is active");
try {
  const history:string[]=[];
  const prior=(await readdir(root)).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)&&n!==date+".json").sort().reverse().slice(0,14);
  for(const name of prior){const job=JSON.parse(await readFile(path.join(root,name),"utf8"));for(const item of job.brief?.items || [])history.push(item.headline+" "+item.sources.map((s:{url:string})=>s.url).join(" "));}
  const result=await generateBrief(date,timezone,history,async stage=>{console.log(stage);});
  await writeFile(path.join(root,date+".acceptance-result.json"),JSON.stringify(result),"utf8");
  console.log(JSON.stringify({status:"awaiting_review",date,items:result.brief.items.map(i=>({category:i.category,title:i.headline})),preferences:result.audit.preferences}));
} catch(error) {
  const e=error as {name?:string;status?:number;message?:string};
  console.error(JSON.stringify({name:e.name,status:e.status,message:e.message}));
  process.exitCode=1;
} finally {await release();}
}
void main().catch(()=>{console.error("Validation could not start");process.exitCode=1;});
