import {mkdir,writeFile} from "node:fs/promises";import path from "node:path";
import {pipelineStorage} from "../editorial/storage-context";
export async function savePipelineArtifact(date:string,stage:"candidates"|"draft",payload:unknown){
 const storage=pipelineStorage.getStore();if(storage)return storage.artifact(date,stage,payload);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error("Invalid date");
 const dir=path.resolve(process.env.DATA_DIR||"./data");await mkdir(dir,{recursive:true});
 await writeFile(path.join(dir,date+"."+stage+".json"),JSON.stringify(payload));
}
