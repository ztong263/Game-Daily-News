import {challenge,clientId,scope} from "./protocol";
import type {GrantStore} from "./store";
export async function exchange(params:URLSearchParams,origin:string,store:GrantStore){
 if(params.get("client_id")!==clientId||params.get("resource")!==origin+"/mcp")throw Error("invalid_grant");
 const kind=params.get("grant_type")==="authorization_code"?"code":params.get("grant_type")==="refresh_token"?"refresh":null;
 if(!kind)throw Error("unsupported_grant_type");
 const token=params.get(kind==="code"?"code":"refresh_token")||"";
 const {owner,grant}=await store.read(token,kind);
 if(grant.clientId!==clientId||grant.resource!==origin+"/mcp"||grant.scope!==scope)throw Error("invalid_grant");
 if(kind==="code"){
  const verifier=params.get("code_verifier")||"";
  if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||grant.challenge!==challenge(verifier)||grant.redirect!==params.get("redirect_uri"))throw Error("invalid_grant");
 }
 if(params.has("scope")&&params.get("scope")!==scope)throw Error("invalid_scope");
 // Atomic consumption prevents code replay and refresh-token races across Vercel workers.
 await store.consume(token,kind);
 const bound={clientId,resource:grant.resource,scope};
 const access=await store.issue(owner,"access",bound,3600);
 const refresh=await store.issue(owner,"refresh",bound,30*86400);
 return {access_token:access,refresh_token:refresh,token_type:"Bearer",expires_in:3600,scope};
}
