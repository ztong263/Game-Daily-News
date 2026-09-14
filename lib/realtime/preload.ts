// Bounded workers keep synthesis and budget writes from flooding the server.
export async function preloadAll(count:number,load:(index:number)=>Promise<unknown>,cancelled:()=>boolean,progress:(done:number)=>void){
 let next=0,done=0;let failure:unknown;
 async function worker(){while(!cancelled()&&!failure){const index=next++;if(index>=count)return;try{await load(index);done++;if(!cancelled())progress(done);}catch(error){failure=error;}}}
 await Promise.all([worker(),worker()]);if(failure)throw failure;
}
