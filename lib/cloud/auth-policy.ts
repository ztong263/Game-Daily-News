export class CloudError extends Error{constructor(message:string,public status:number){super(message);}}
export function assertOwner(user:{id:string;email?:string;email_confirmed_at?:string}|null,allowedEmail=process.env.GAME_DAILY_OWNER_EMAIL){
 if(!allowedEmail?.trim())throw new CloudError("请先配置网站所有者账号。",503);
 if(!user)throw new CloudError("请先登录。",401);
 if(!user.email_confirmed_at||user.email?.toLowerCase()!==allowedEmail.trim().toLowerCase())throw new CloudError("此账号没有访问权限。",403);
 return user.id;
}
export function assertSameOrigin(request:Request){
 if(["GET","HEAD","OPTIONS"].includes(request.method))return;
 const expected=process.env.APP_ORIGIN||new URL(request.url).origin;
 if(request.headers.get("origin")!==expected||request.headers.get("sec-fetch-site")==="cross-site")throw new CloudError("请求来源无效。",403);
}
