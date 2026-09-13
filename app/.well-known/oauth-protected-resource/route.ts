import {publishConfig} from "@/lib/publish/store";
import {scope} from "@/lib/publish/protocol";
export function GET(){try{const origin=publishConfig();return Response.json({resource:origin+"/mcp",authorization_servers:[origin],scopes_supported:[scope]});}catch{return new Response(null,{status:503});}}
