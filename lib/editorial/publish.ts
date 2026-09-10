import {briefSchema,type MorningBrief,contentSchema} from "../brief/schema";
import type {z} from "zod";
import {citationKey} from "../brief/source-url";
export {citationKey} from "../brief/source-url";
export function publishDraft(content:z.infer<typeof contentSchema>,allowed:Set<string>,date:string,timezone:string):MorningBrief{
 const registry=new Map([...allowed].map(url=>[citationKey(url),url]));
 const items=content.items.flatMap(item=>{
 const sources=item.sources.map(source=>{const canonical=registry.get(citationKey(source.url));return canonical?{...source,url:canonical}:null;});
 if(sources.some(source=>source===null))return [];
 const gameRadar=item.gameRadar?{...item.gameRadar,officialUrl:registry.get(citationKey(item.gameRadar.officialUrl)) || item.gameRadar.officialUrl}:item.gameRadar;
 return [{...item,gameRadar,sources:sources.filter(source=>source!==null)}];
 });
 if(!items.length)throw Error("No traceable stories");
 const removed=items.length!==content.items.length;
 return briefSchema.parse({...content,items,
 editorNote:removed?[content.editorNote,"部分候选内容因来源不足未纳入本期。"].filter(Boolean).join(" "):content.editorNote,
 todaysSignal:removed?{text:"本期可核实的材料不足以支持统一趋势，建议分别查看各条内容。",itemIds:[]}:content.todaysSignal,
 schemaVersion:1,id:"brief-"+date,version:crypto.randomUUID(),date,timezone,generatedAt:new Date().toISOString(),locale:"zh-CN"});
}
