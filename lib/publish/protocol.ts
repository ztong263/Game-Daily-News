import {createHash,randomBytes} from "node:crypto";
import {z} from "zod";
import {briefSchema} from "../brief/schema";
export const scope="brief:publish";
export const clientId="game-daily-chatgpt";
export const callback="https://chatgpt.com/connector_platform_oauth_redirect";
export const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export const challenge=(value:string)=>createHash("sha256").update(value).digest("base64url");
export function secret(owner:string){return owner+"."+randomBytes(32).toString("base64url");}
export function tokenOwner(token:string){
 if(!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token))throw Error("invalid_grant");
 return token.slice(0,36);
}
export const publishSchema=z.object({
 brief:briefSchema,
 activate:z.boolean().default(true),
 idempotencyKey:z.string().min(1).max(200).describe("Stable key for this edition, e.g. chatgpt-game-daily-2026-09-13. Reuse exactly for retries."),
});
export function authorizationInput(params:URLSearchParams,origin:string){
 const p=Object.fromEntries(params);
 if(p.client_id!==clientId||p.redirect_uri!==callback||p.response_type!=="code"||p.code_challenge_method!=="S256"||! /^[A-Za-z0-9_-]{43}$/.test(p.code_challenge||"")||p.resource!==origin+"/mcp"||p.scope!==scope||!p.state||p.state.length>2048)throw Error("invalid_request");
 return {clientId:p.client_id,redirect:p.redirect_uri,challenge:p.code_challenge,resource:p.resource,scope:p.scope,state:p.state};
}
export async function limitedBody(request:Request,limit=1_000_000){
 if(Number(request.headers.get("content-length"))>limit)throw Error("payload_too_large");
 const reader=request.body?.getReader();if(!reader)return "";
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error("payload_too_large");}chunks.push(value);}
 return Buffer.concat(chunks).toString("utf8");
}
