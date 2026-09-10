import type {EditorialPreferences} from "./preferences";
export function researchPlan(calls:number,p:EditorialPreferences){
 const radar=p.categories.includes("game_radar")&&p.radarMaxPicks>0;
 const general=p.categories.some(c=>c!=="game_radar");
 if(!radar)return {general:calls,radar:0};
 if(!general)return {general:0,radar:calls};
 const reserved=Math.ceil(calls/2);
 return {general:calls-reserved,radar:reserved};
}
export function radarNote(coverage:string,picks:number){
 if(coverage==="disabled")return "";
 if(coverage!=="checked")return "本期游戏雷达检索不足，未能充分核实候选；这不代表没有值得推荐的游戏。";
 if(!picks)return "本期已做游戏专项检索与原文核验，但候选未通过推荐条件或已在往期收录，因此不凑数推荐。";
 return "";
}
