import OpenAI from "openai";
import {CloudError} from "./auth-policy";

// Never return provider messages: they may contain credentials or submitted text.
export function cloudFailure(error:unknown){
 if(error instanceof CloudError)return {error:error.message,status:error.status};
 if(error instanceof SyntaxError)return {error:"JSON 格式错误。",status:400};
 if(error instanceof Error&&error.message==="尚未配置 API 密钥")return {error:"网站尚未配置 OPENAI_API_KEY，请在 Vercel 添加后重新部署。",status:503};
 if(error instanceof OpenAI.APIConnectionTimeoutError)return {error:"AI 服务响应超时，请稍后重试。",status:504};
 if(error instanceof OpenAI.APIConnectionError)return {error:"网站暂时无法连接 AI 服务，请稍后重试。",status:502};
 if(error instanceof OpenAI.APIError){
  if(error.status===401)return {error:"OpenAI API 密钥验证失败，请检查 Vercel 中的 OPENAI_API_KEY。",status:503};
  if(error.code==="insufficient_quota")return {error:"OpenAI API 可用额度不足，请检查 API 余额和用量上限。",status:503};
  if(error.status===429)return {error:"AI 服务请求受限，请稍后重试；若持续出现，请检查 API 用量限制。",status:429};
  if(error.status===403||error.code==="model_not_found")return {error:"OpenAI API 项目没有所需服务或模型的访问权限，请检查配置。",status:503};
  if(error.status===400)return {error:"AI 服务拒绝了请求，请检查播报段落长度和语音模型设置。",status:502};
  return {error:"AI 服务处理失败，请稍后重试。",status:502};
 }
 if(error&&typeof error==="object"&&("code" in error||"statusCode" in error))return {error:"云端数据库或音频存储操作失败，请检查存储配置与权限。",status:503};
 return {error:"云端请求未完成，请检查配置或稍后重试。",status:503};
}
