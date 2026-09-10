// Compatibility only: reuse supplied text and links; never search or invent evidence.
export function normalizeImport(value:unknown):unknown {
 if(!value||typeof value!=="object"||Array.isArray(value))return value;
 const brief=structuredClone(value) as Record<string,unknown>;
 if(!Array.isArray(brief.items))return brief;
 for(const item of brief.items){
  if(!item||typeof item!=="object"||!item.gameRadar||typeof item.gameRadar!=="object")continue;
  const radar=item.gameRadar;
  item.category="game_radar";
  if(radar.status==="demo / early_access_planned")radar.status="demo";
  if(!radar.recommendation){
   if(typeof radar.whyFun==="string"&&radar.whyFun.trim()&&typeof radar.whyStudy==="string"&&radar.whyStudy.trim())radar.recommendation="both";
  }
  if(!radar.officialUrl&&Array.isArray(radar.sources)&&Array.isArray(item.sources)){
   const source=radar.sources.find((s:{kind?:string;url?:string})=>s.kind==="primary"&&typeof s.url==="string"&&item.sources.some((top:{kind?:string;url?:string})=>top.kind==="primary"&&top.url===s.url));
   if(source)radar.officialUrl=source.url;
  }
  if(!radar.evidence&&typeof item.uncertainty==="string"&&item.uncertainty.trim())radar.evidence="导入者提供的核验说明（未由网页独立复核）："+item.uncertainty;
 }
 return brief;
}
