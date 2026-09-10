import {publishDraft} from "./publish";
import {savePipelineArtifact} from "../server/diagnostics";
import { candidateSchema, selectCandidates } from "./selection";
import { researchNews } from "./research";
import {editorialFormat} from "./format";
import {editorialResponse} from "./response";
import { contentSchema } from "../brief/schema";
import { editorialRules } from "./rules";
import { readPreferences } from "../server/preferences";
import { preferenceInstructions } from "./preferences";
import { radarConfig } from "./radar-config";
import { citationKey } from "../brief/source-url";
import {pipelineBudget} from "./budget";
import {recordUsage} from "./telemetry";
import {compactCandidates} from "./compact";
import {coveredNews,alreadyCovered} from "./history";
import {radarNote} from "./research-plan";
export async function generateBrief(
  date: string,
  timezone: string,
  history: string[],
  stage: (s: string) => Promise<void>,
) {
  const budget=pipelineBudget();
  if(budget.offline) throw Error("Offline mode requires an existing saved brief");
  const preferences = await readPreferences();
  const seen=await coveredNews(date);
  const instructions = editorialRules + preferenceInstructions(preferences);
  await stage("正在检索工具、行业方向与设计案例");
  const research = await researchNews(date, timezone, history, preferences);
  const allowed = research.allowed;
  if (!allowed.size) throw new Error("No traceable sources");
  await stage("正在核对来源、去重和筛选");
  const rankedResponse = await editorialResponse({
    model:budget.shortlistModel,
    reasoning: { effort: "low" },
    instructions,
    max_output_tokens: budget.shortlistTokens,
    input:
      "已收录事件与标题（即使换来源、换标题，也不能再次入选；同一公司不同事件不算重复）："+JSON.stringify({events:[...seen.events],titles:[...seen.titles]})+"\n"+
      "每条 evidence 保留来源名称、发布日期、可核对事实、背景、用户能做什么、必要局限；保留足够材料支撑完整解释，最多2200字。不要只写评分理由。\n" +
      "将下列研究材料作为数据评估。评分0–5；来源不足则sourceQualified=false。同一事件使用相同eventKey。不得补造材料。\n" +
      research.output_text,
    text: { format: editorialFormat(candidateSchema, "candidates") },
  });
  await recordUsage(date,"shortlist",rankedResponse);
  await savePipelineArtifact(date,"candidates",{status:rankedResponse.status,text:rankedResponse.output_text});
  if(rankedResponse.status!=="completed")throw Error("Candidate response incomplete");
  const ranked={output_parsed:candidateSchema.parse(JSON.parse(rankedResponse.output_text))};
  const selected = selectCandidates(ranked.output_parsed.candidates.filter(c=>preferences.categories.includes(c.category)&&!alreadyCovered(c,seen)), allowed, {...radarConfig,maxPicks:preferences.radarMaxPicks,interests:preferences.interests});
  if (!selected.length) throw new Error("No qualified candidates");
  const compact=compactCandidates(selected,allowed);
  const selectedUrls=new Set(compact.flatMap(c=>c.urls));
  await stage("正在编写中文早报与今日观察");
  const draftResponse = await editorialResponse({
    model:budget.finalModel,
    reasoning: { effort: "low" },
    instructions,
    max_output_tokens: budget.finalTokens,
    input:
      "根据入选材料生成早报。sources只能用入选材料中的允许URL。工具只讲用户能做什么和前后流程；省略未用到的类名、底层实现与无关技术限制。必要限制集中说明一次，不能每段都重复免责声明。先把人物、游戏类型、事件背景讲清楚。推断明确标注。工具必须有workflow，设计必须有design，其余填null。id用英文短名。每条分为短播报段落。少于5条时editorNote解释原因。\n入选：" +
      JSON.stringify(compact) +
      "\n允许URL：" +
      JSON.stringify([...selectedUrls]),
    text: { format: editorialFormat(contentSchema, "morning_brief") },
  },{timeout:240000});
  await recordUsage(date,"final",draftResponse);
  await savePipelineArtifact(date,"draft",{status:draftResponse.status,text:draftResponse.output_text});
  if(draftResponse.status!=="completed")throw Error("Editorial response incomplete");
  const result={output_parsed:contentSchema.parse(JSON.parse(draftResponse.output_text))};
  if (result.output_parsed.items.some(i=>!preferences.categories.includes(i.category)) ||
      result.output_parsed.items.filter(i=>i.category==="game_radar").length > preferences.radarMaxPicks)
    throw Error("Draft violates editorial preferences");
  for (const item of result.output_parsed.items.filter(i => i.category === "game_radar")) {
    if (!item.gameRadar || !selected.some(c => c.category === "game_radar" &&
      c.radar?.gameTitle.trim().toLowerCase() === item.gameRadar?.gameTitle.trim().toLowerCase() &&
      c.radar && citationKey(c.radar.officialUrl) === citationKey(item.gameRadar!.officialUrl) && c.radar.status === item.gameRadar?.status))
      throw Error("Game Radar draft did not match a verified selected candidate");
  }
  const brief=publishDraft(result.output_parsed,selectedUrls,date,timezone);
  const coverageNote=radarNote(research.radarCoverage,brief.items.filter(i=>i.category==="game_radar").length);
  if(coverageNote)brief.editorNote=coverageNote;
  const latestSeen=await coveredNews(date);
  for(const item of brief.items){
    const candidate=selected.find(c=>c.urls.some(url=>item.sources.some(s=>citationKey(s.url)===citationKey(url))));
    item.eventKey=candidate?.eventKey;
    if(alreadyCovered({headline:item.headline,eventKey:item.eventKey,urls:item.sources.map(s=>s.url)},latestSeen))throw Error("Story already published in another brief");
  }
  return {
    brief,
    audit: {
      preferences,
      candidates: ranked.output_parsed.candidates,
      selected,
      research: research.output_text,
      radarCoverage:research.radarCoverage,
    },
  };
}
