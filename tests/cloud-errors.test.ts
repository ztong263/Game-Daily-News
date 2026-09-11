import test from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import {cloudFailure} from "../lib/cloud/errors";
test("cloud errors distinguish authentication, quota, throttling and storage without exposing upstream content",()=>{
 const provider=(status:number,code:string)=>new OpenAI.APIError(status,{code,message:"PRIVATE provider content"},"PRIVATE key",new Headers());
 assert.match(cloudFailure(provider(401,"invalid_api_key")).error,/密钥验证失败/);
 assert.match(cloudFailure(provider(429,"insufficient_quota")).error,/额度不足/);
 assert.equal(cloudFailure(provider(429,"rate_limit_exceeded")).status,429);
 assert.match(cloudFailure(new Error("尚未配置 API 密钥")).error,/OPENAI_API_KEY/);
 assert.match(cloudFailure({code:"42501",message:"PRIVATE row"}).error,/存储/);
 for(const e of [provider(400,"bad_request"),provider(500,"server_error"),new Error("PRIVATE key")])assert.doesNotMatch(JSON.stringify(cloudFailure(e)),/PRIVATE/);
});
