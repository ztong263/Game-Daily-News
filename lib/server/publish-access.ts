import {timingSafeEqual} from "node:crypto";
import {localAccess} from "./access";
import {BriefError} from "./brief-versions";
import {cloudEnabled} from "../cloud/config";
export function publishAccess(request:Request){
 if(cloudEnabled())throw new BriefError("云端发布必须使用登录账号。",403);
 const authorization=request.headers.get("authorization");
 if(authorization){const expected=process.env.BRIEF_PUBLISH_TOKEN;const token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
 if(!expected||!token||Buffer.byteLength(token)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(token),Buffer.from(expected)))throw new BriefError("发布凭证无效。",401);
 return;}
 try{localAccess(request);const origin=request.headers.get("origin");if(!origin)throw Error("Missing origin");}catch{throw new BriefError("请从本机页面操作，外部客户端需要发布凭证。",403);}
}
