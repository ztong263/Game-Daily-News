import {cachedResearch,saveResearch} from "../server/research-cache";
import {editorialResponse} from "./response";
import {PipelinePending} from "./storage-context";
import {researchPlan} from "./research-plan";
import {pipelineBudget} from "./budget";
import {recordUsage} from "./telemetry";
import { editorialRules } from "./rules";
import { preferenceInstructions, defaultPreferences, type EditorialPreferences } from "./preferences";
function urlsIn(value: unknown, result = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((v) => urlsIn(v, result));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "url" && typeof v === "string") result.add(v);
      else urlsIn(v, result);
    }
  }
  return result;
}
async function researchLane(
  date: string,
  timezone: string,
  history: string[],
  preferences: EditorialPreferences = defaultPreferences,
  lane="general", calls=6,
) {
  const budget=pipelineBudget();
  if(budget.offline) throw Error("Offline mode cannot research");
  const model = budget.discoveryModel;
  const instructions=editorialRules + preferenceInstructions(preferences);
  const cacheKey=JSON.stringify({date,timezone,history,model,budget,lane,calls,rules:instructions,version:7});
  const cached=await cachedResearch(cacheKey);if(cached){await recordUsage(date,"discovery-"+lane,undefined,true);return cached;}
  const research = await editorialResponse({
    model,
    reasoning: { effort: "low" },
    tools: [{ type: "web_search" }],
    include: ["web_search_call.action.sources"],
    max_output_tokens: Math.max(1200,Math.floor(budget.discoveryTokens*calls/budget.searchCalls)),
    // The API supports this field; SDK 7.13 omits it on HTTP create params.
    ...{max_tool_calls: calls},
    instructions,
    input:
      (lane==="radar"?"只做游戏专项检索：先搜索符合兴趣的独立游戏、新作和试玩，至少预留一次调用打开官方商店或开发者页面核实当前状态。争取核验2–3个候选。提供具体玩法、值得玩的原因和可借鉴的设计。没完成核验必须写‘检索不足’，不能说没有值得推荐的游戏。\n":"普通新闻专用检索，不搜索游戏推荐，游戏雷达有独立预算。\n")+
      "这是指定日期的历史早报：只纳入当地该日期结束前已经公开的事实，禁止使用之后发布的消息或后来发生的进展。无法核实发布时间的时效新闻不采用。\n" +
      "合并相近主题检索，尽量留1–2次工具调用核对关键原文。搜索预算耗尽后如实报告证据不足，不补造。每条候选提供标题、来源名称、日期、URL和2–5句有实质事实的摘要。\n" +
      "当地日期 " +
      date +
      "，时区 " +
      timezone +
      "。只搜索用户已启用的内容方向，争取12–20条候选。如启用游戏雷达则核实游戏官方页面、开发者、发行/试玩状态，区分已验证信息与宣传。打开关键原文并比较。输出可核对材料、URL、发布日期、证据与局限。历史已选标题与来源：" +
      JSON.stringify(history),
  });
  await recordUsage(date,"discovery-"+lane,research);
  if(research.status!=="completed") throw Error("Research response incomplete");
  const allowed = urlsIn(research.output);
  const opened=research.output.some(o=>o.type==="web_search_call"&&o.status==="completed"&&o.action.type==="open_page");
  const result={ output_text: research.output_text, allowed,radarCoverage:opened&&allowed.size>0&&!research.output_text.includes("检索不足")?"checked":"insufficient" };
  if(allowed.size)await saveResearch(cacheKey,result);
  return result;
}
export async function researchNews(date:string,timezone:string,history:string[],preferences:EditorialPreferences=defaultPreferences){
 const budget=pipelineBudget();if(budget.offline)throw Error("Offline mode cannot research");
 const plan=researchPlan(budget.searchCalls,preferences);
 const texts:string[]=[];const allowed=new Set<string>();let radarCoverage=plan.radar?"insufficient":"disabled";
 for(const lane of ["general","radar"] as const){
  if(!plan[lane])continue;
  const p={...preferences,categories:preferences.categories.filter(c=>lane==="radar"?c==="game_radar":c!=="game_radar")};
  try{
   const result=await researchLane(date,timezone,history,p,lane,plan[lane]);
   texts.push(result.output_text);result.allowed.forEach(u=>allowed.add(u));
   if(lane==="radar")radarCoverage=result.radarCoverage||"insufficient";
  }catch(error){if(error instanceof PipelinePending||lane!=="radar")throw error;await recordUsage(date,"discovery-radar-failed");texts.push("游戏专项检索不足，不能以此断言没有合适游戏。");}
 }
 return {output_text:texts.join("\n\n"),allowed,radarCoverage};
}
