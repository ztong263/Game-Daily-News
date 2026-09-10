import {createHash} from "node:crypto";
export function stableJson(value:unknown):string{
 if(Array.isArray(value))return "["+value.map(stableJson).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+":"+stableJson(v)).join(",")+"}";
 return JSON.stringify(value);
}
export const fingerprint=(value:unknown)=>createHash("sha256").update(stableJson(value)).digest("hex");
