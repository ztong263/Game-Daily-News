import {pipelineBudget} from "../lib/editorial/budget";
import {recordUsage} from "../lib/editorial/telemetry";
import {compactCandidates} from "../lib/editorial/compact";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { api } from "../lib/server/openai";
import { acquireLock } from "../lib/server/lock";
import { editorialRules } from "../lib/editorial/rules";
import { preferencesSchema, preferenceInstructions } from "../lib/editorial/preferences";
import { candidateSchema } from "../lib/editorial/selection";
import { contentSchema, dateInZone } from "../lib/brief/schema";
import { editorialFormat } from "../lib/editorial/format";
import { publishDraft, citationKey } from "../lib/editorial/publish";
async function main() {
  const budget=pipelineBudget();
  if(budget.offline)throw Error("Offline mode cannot generate");
  if(!process.argv.includes("--regenerate"))throw Error("Explicit --regenerate is required for paid maintenance generation");
  const root=path.resolve(process.env.DATA_DIR || "./data");
  const timezone=process.env.BRIEF_TIMEZONE || "Australia/Sydney";
  const date=dateInZone(new Date(),timezone);
  const checkpoint=JSON.parse(await readFile(path.join(root,date+".acceptance-checkpoint.json"),"utf8"));
  const preferences=preferencesSchema.parse(checkpoint.preferences);
  const selected=candidateSchema.parse({candidates:checkpoint.selected}).candidates;
  const allowed=new Set<string>(checkpoint.research.urls);
  const release=await acquireLock(path.join(root,date+".lock"));
  if(!release)throw Error("Another generation is active");
  try {
    console.log("Resuming draft from saved research and selection");
    const response=await api().responses.create({
      model:budget.finalModel,reasoning:{effort:"low"},max_output_tokens:budget.finalTokens,
      instructions:editorialRules+preferenceInstructions(preferences),
      input:"只基于以下已核验入选材料编写本期早报，不进行新搜索。只使用允许URL。工具讲能做什么、旧流程和新流程，省略底层类名和无关技术限制。背景要完整，必要局限集中说明一次，不反复免责声明。普通条目gameRadar填null，游戏雷达填完整信息，保留核实的状态，不把试玩版写成正式发售。可根据质量减少条目，但不任意忽略合格游戏雷达。用短段落自然播报。\n入选："+JSON.stringify(compactCandidates(selected,allowed))+"\n允许URL："+JSON.stringify([...allowed]),
      text:{format:editorialFormat(contentSchema,"morning_brief")},
    },{timeout:240000});
    await recordUsage(date,"maintenance-final",response);
    await writeFile(path.join(root,date+".acceptance-draft.json"),JSON.stringify({status:response.status,text:response.output_text}),"utf8");
    if(response.status!=="completed")throw Error("Draft incomplete");
    const content=contentSchema.parse(JSON.parse(response.output_text));
    if(content.items.some(i=>!preferences.categories.includes(i.category))||content.items.filter(i=>i.category==="game_radar").length>preferences.radarMaxPicks)throw Error("Draft violates preferences");
    for(const item of content.items.filter(i=>i.category==="game_radar")) {
      if(!item.gameRadar||!selected.some(c=>c.radar&&c.radar.gameTitle.trim().toLowerCase()===item.gameRadar!.gameTitle.trim().toLowerCase()&&citationKey(c.radar.officialUrl)===citationKey(item.gameRadar!.officialUrl)&&c.radar.status===item.gameRadar!.status))throw Error("Unverified radar recommendation");
    }
    const brief=publishDraft(content,allowed,date,timezone);
    await writeFile(path.join(root,date+".acceptance-result.json"),JSON.stringify({brief,audit:{preferences,selected,research:checkpoint.research.output_text}}),"utf8");
    console.log(JSON.stringify({status:"awaiting_review",date,items:brief.items.map(i=>({category:i.category,title:i.headline}))}));
  } finally {await release();}
}
void main().catch(error=>{
  const e=error as {name?:string;status?:number;code?:string;message?:string};
  console.error(JSON.stringify({name:e.name,status:e.status,code:e.code,message:e.message}));process.exitCode=1;
});
