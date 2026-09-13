import {publishConfig} from "@/lib/publish/store";
import {scope} from "@/lib/publish/protocol";
export function GET(){try{const origin=publishConfig();return Response.json({issuer:origin,authorization_endpoint:origin+"/connect/authorize",token_endpoint:origin+"/connect/token",response_types_supported:["code"],grant_types_supported:["authorization_code","refresh_token"],token_endpoint_auth_methods_supported:["none"],code_challenge_methods_supported:["S256"],scopes_supported:[scope],authorization_response_iss_parameter_supported:true});}catch{return new Response(null,{status:503});}}
