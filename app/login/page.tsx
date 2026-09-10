"use client";
import {useState} from "react";
import {createBrowserClient} from "@supabase/ssr";
import {useRouter} from "next/navigation";
export default function Login(){
 const router=useRouter();
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 return <main style={{maxWidth:360,margin:"15vh auto",padding:24}}><h1>Game Daily</h1><form onSubmit={async event=>{
  event.preventDefault();setBusy(true);setError("");
  const fields=new FormData(event.currentTarget);
  try{
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
   if(!url||!key)throw Error("网站登录尚未配置完成。");
   const client=createBrowserClient(url,key);
   const {error}=await client.auth.signInWithPassword({email:String(fields.get("email")),password:String(fields.get("password"))});
   if(error)throw Error("登录失败，请检查邮箱和密码。");
   router.replace("/");router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"登录失败");setBusy(false);}
 }} style={{display:"grid",gap:16}}>
 <label>邮箱<input name="email" type="email" autoComplete="username" required style={{width:"100%"}}/></label>
 <label>密码<input name="password" type="password" autoComplete="current-password" required style={{width:"100%"}}/></label>
 <button disabled={busy}>{busy?"正在登录…":"登录"}</button>
 {error&&<p role="alert">{error}</p>}
 </form></main>;
}
