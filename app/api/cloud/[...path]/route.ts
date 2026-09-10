import {cloudRequest} from "@/lib/cloud/handler";
import {cloudEnabled} from "@/lib/cloud/config";
export const runtime="nodejs";
export const maxDuration=300;
function handle(request:Request){
 if(!cloudEnabled())return Response.json({error:"云端模式未启用。"},{status:404});
 return cloudRequest(request);
}
export const GET=handle;
export const POST=handle;
export const PUT=handle;
