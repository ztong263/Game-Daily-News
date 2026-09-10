import {runDate,status} from "../lib/server/store";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
async function main(){
  const date=process.argv[2];
  if(!date)throw Error("Provide archive date");
  const started=Date.now();
  console.log(JSON.stringify({date,status:"starting"}));
  await runDate(date);
  const job=await status(date);
  const usageFile=path.resolve(process.env.DATA_DIR||"./data","telemetry/editorial.jsonl");
  const rows=(await readFile(usageFile,"utf8")).trim().split("\n").map(line=>JSON.parse(line)).filter(row=>row.date===date && Date.parse(row.at)>=started);
  const report={date,status:job.status,elapsedSeconds:Math.round((Date.now()-started)/1000),stages:rows,
    inputTokens:rows.reduce((sum,r)=>sum+(r.inputTokens||0),0),outputTokens:rows.reduce((sum,r)=>sum+(r.outputTokens||0),0),toolCalls:rows.reduce((sum,r)=>sum+(r.toolCalls||0),0),
    items:job.brief?.items.map(i=>({title:i.headline,category:i.category})),error:job.error};
  await writeFile(path.resolve(process.env.DATA_DIR||"./data",date+".usage-report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  if(job.status!=="ready")process.exitCode=1;
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Generation failed");process.exitCode=1;});
