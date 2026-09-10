import {readdir,readFile} from "node:fs/promises";
import path from "node:path";
import {briefSchema} from "../brief/schema";
import {citationKey} from "../brief/source-url";
import {pipelineBudget} from "./budget";
import {pipelineStorage} from "./storage-context";
export type SeenNews={urls:Set<string>;events:Set<string>;titles:Set<string>};
const normalized=(value:string)=>value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
export function alreadyCovered(item:{urls:string[];eventKey?:string;headline:string},seen:SeenNews){
  return item.urls.some(url=>seen.urls.has(citationKey(url))) ||
    (!!item.eventKey && seen.events.has(normalized(item.eventKey))) || seen.titles.has(normalized(item.headline));
}
export async function coveredNews(date:string){
  const storage=pipelineStorage.getStore();if(storage)return storage.history(date);
  const seen:SeenNews={urls:new Set(),events:new Set(),titles:new Set()};
  const root=path.resolve(process.env.DATA_DIR||"./data",pipelineBudget().mode==="preview"?"preview":".");
  let files:string[];try{files=await readdir(root);}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return seen;throw e;}
  for(const name of files.filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)&&n!==date+".json")){
    let raw:unknown;
    try{raw=JSON.parse(await readFile(path.join(root,name),"utf8")).brief;}catch{continue;}
    const parsed=briefSchema.safeParse(raw);
    if(!parsed.success)continue;
    for(const item of parsed.data.items){
      item.sources.forEach(s=>seen.urls.add(citationKey(s.url)));
      seen.titles.add(normalized(item.headline));
      if(item.eventKey)seen.events.add(normalized(item.eventKey));
    }
  }
  return seen;
}
