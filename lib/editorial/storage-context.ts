import {AsyncLocalStorage} from "node:async_hooks";
import type {Response,ResponseCreateParamsNonStreaming} from "openai/resources/responses/responses";
import type {EditorialPreferences} from "./preferences";
import type {SeenNews} from "./history";
export type ResearchValue={output_text:string;allowed:Set<string>;radarCoverage?:string};
export interface PipelineStorage{
 preferences():Promise<EditorialPreferences>;
 history(date:string):Promise<SeenNews>;
 research(key:string):Promise<ResearchValue|null>;
 saveResearch(key:string,value:ResearchValue):Promise<void>;
 artifact(date:string,stage:string,payload:unknown):Promise<void>;
 usage(date:string,stage:string,response:unknown,cacheHit:boolean):Promise<void>;
 response(params:ResponseCreateParamsNonStreaming):Promise<Response>;
}
export const pipelineStorage=new AsyncLocalStorage<PipelineStorage>();
export class PipelinePending extends Error{}
