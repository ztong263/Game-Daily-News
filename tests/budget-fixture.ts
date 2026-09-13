export function budgetFixture(){
 const rows=new Map<string,{revision:number;entries:Record<string,unknown>}>();
 return (url:URL,init?:RequestInit):Response|undefined=>{
  const method=init?.method||"GET";
  if(url.pathname.endsWith("/gd_usage")&&method==="GET")return Response.json([]);
  if(!url.pathname.endsWith("/gd_pipeline_cache"))return;
  const body=init?.body?JSON.parse(String(init.body)):null;
  const key=body?.cache_key||url.searchParams.get("cache_key")?.slice(3);
  if(!key?.startsWith("daily-budget:"))return;
  if(method==="GET")return Response.json(rows.has(key)?{payload:structuredClone(rows.get(key))}:null);
  if(method==="POST"){if(!rows.has(key))rows.set(key,body.payload);return new Response(null,{status:201});}
  if(method==="PATCH"){
   const revision=Number(url.searchParams.get("payload->>revision")?.slice(3));
   if(rows.get(key)?.revision!==revision)return Response.json([]);
   rows.set(key,body.payload);return Response.json([{cache_key:key}]);
  }
 };
}
