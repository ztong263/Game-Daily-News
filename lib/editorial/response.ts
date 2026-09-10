import type {ResponseCreateParamsNonStreaming} from "openai/resources/responses/responses";
import {api} from "../server/openai";
import {pipelineStorage} from "./storage-context";
export function editorialResponse(params:ResponseCreateParamsNonStreaming,options?:{timeout:number}){
 const storage=pipelineStorage.getStore();
 return storage?storage.response(params):api().responses.create(params,options);
}
