import OpenAI from "openai";
export function api() {
  if (!process.env.OPENAI_API_KEY) throw new Error("尚未配置 API 密钥");
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 180_000,
    maxRetries: 0,
  });
}
export function publicError(error: unknown) {
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return "新闻服务响应超时，请稍后重试。";
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429)
      return "API 额度不足或请求过于频繁，请检查账户额度后重试。";
    if (error.status === 401 || error.status === 403)
      return "API 密钥或项目权限不可用，请检查服务端配置。";
  }
  return "准备失败，请稍后重试；已保存的早报不会被覆盖。";
}
