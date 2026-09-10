import {appendFile, mkdir} from "node:fs/promises";
import path from "node:path";
import {pipelineBudget} from "./budget";
import {pipelineStorage} from "./storage-context";
type ResponseUsage = {id?:string; model?:string; status?:string; usage?:{input_tokens:number; output_tokens:number; total_tokens:number; input_tokens_details?:{cached_tokens:number}; output_tokens_details?:{reasoning_tokens:number}}|null; output?:{type:string}[]};
export async function recordUsage(date:string, stage:string, response?:ResponseUsage, cacheHit=false) {
  const storage=pipelineStorage.getStore();if(storage)return storage.usage(date,stage,response,cacheHit);
  const dir=path.resolve(process.env.DATA_DIR || "./data", "telemetry");
  await mkdir(dir,{recursive:true});
  await appendFile(path.join(dir,"editorial.jsonl"),JSON.stringify({
    at:new Date().toISOString(),date,mode:pipelineBudget().mode,stage,cacheHit,
    responseId:response?.id ?? null,model:response?.model ?? null,status:response?.status ?? (cacheHit?"cached":"failed"),
    inputTokens:response?.usage?.input_tokens ?? null,outputTokens:response?.usage?.output_tokens ?? null,
    totalTokens:response?.usage?.total_tokens ?? null,
    cachedInputTokens:response?.usage?.input_tokens_details?.cached_tokens ?? null,
    reasoningTokens:response?.usage?.output_tokens_details?.reasoning_tokens ?? null,
    toolCalls:response ? (response.output || []).filter(o=>o.type==="web_search_call").length : 0,
  })+"\n");
}
