import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {WebStandardStreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {publishSchema,scope} from "./protocol";
import {CloudError} from "../cloud/auth-policy";
export async function handleMcp(request:Request,body:unknown,publish:(input:unknown)=>Promise<unknown>){
 const server=new McpServer({name:"game-daily-publisher",version:"1.0.0"},{instructions:"Publish only an already prepared MorningBrief. For scheduled ChatGPT news, research the past 24 hours. The tool does not research, rewrite, synthesize audio or charge OpenAI. Reuse the same idempotencyKey and payload when retrying. Never claim publication succeeded without an ok result."});
 server.registerTool("publish_morning_brief",{
  title:"发布游戏早报",description:"Use this when the user wants to publish their completed MorningBrief to their Game Daily website. Keeps previous versions; activate selects this edition for playback. No news search or speech generation. Requires explicit user intent to publish.",
  inputSchema:publishSchema,
  annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:true},
  _meta:{securitySchemes:[{type:"oauth2",scopes:[scope]}]},
 },async input=>{
  try{
   const result=await publish({...input,brief:{...input.brief,sourceType:"imported_chatgpt"}});
   return {content:[{type:"text" as const,text:JSON.stringify(result)}]};
  }catch(error){
   return {isError:true,content:[{type:"text" as const,text:error instanceof CloudError?error.message:"发布未完成；请保留相同内容和请求标识重试。"}]};
  }
 });
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 await server.connect(transport);
 try{return await transport.handleRequest(request,{parsedBody:body});}finally{await server.close();}
}
