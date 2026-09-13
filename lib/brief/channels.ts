export type BriefChannel="gpt"|"website"|"json";
export type BriefVersion={id:string;version:string;date:string;title:string;sourceType:string;ingestionChannel?:string;createdAt:string;active:boolean};
export function versionChannel(v:Pick<BriefVersion,"sourceType"|"ingestionChannel">):BriefChannel|"legacy"{
 if(v.sourceType==="generated")return "website";
 if(v.ingestionChannel==="chatgpt_publish")return "gpt";
 if(v.ingestionChannel==="json_import"||v.sourceType==="manual")return "json";
 return "legacy";
}
export const channelLabels={gpt:"GPT 发布",website:"网页生成",json:"JSON 导入",legacy:"历史导入"};
