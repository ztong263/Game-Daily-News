import {timingSafeEqual} from "node:crypto";
import {callback} from "./protocol";

export const consentHeaders={
 "Content-Type":"text/html; charset=utf-8",
 "Cache-Control":"no-store",
 // no-referrer makes native form POSTs send Origin:null, failing our origin check.
 "Referrer-Policy":"same-origin",
 // Chromium also applies form-action to the redirect after the same-origin POST.
 "Content-Security-Policy":`default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${callback}; frame-ancestors 'none'; base-uri 'none'`,
};
export function verifyConsent(request:Request,origin:string,expected:string,actual:string){
 if(request.headers.get("origin")!==origin)throw Error("invalid_origin");
 if(!/^[a-f0-9]{64}$/.test(expected)||!/^[a-f0-9]{64}$/.test(actual)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))throw Error("invalid_csrf");
}
export function consentFailure(error:unknown){
 const code=error instanceof Error?error.message:"";
 const messages:Record<string,string>={
  invalid_origin:"授权页面来源校验失败。请关闭旧授权页，从 ChatGPT 重新连接。",
  invalid_csrf:"授权页面已过期或被另一个授权页面替换。请从 ChatGPT 重新连接，并只保留一个授权窗口。",
  invalid_request:"授权参数不匹配。请检查插件的客户端 ID 和回调地址。",
  storage_unavailable:"授权凭证保存失败，请稍后重试。",
  publish_disabled:"网站发布功能未开启。",
  publish_not_configured:"网站发布地址配置不完整。",
 };
 return messages[code]||"授权未完成，请确认网站账号已登录，再从 ChatGPT 重新连接。";
}
