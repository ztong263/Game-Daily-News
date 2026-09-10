"use client";
import {useState} from "react";
import Link from "next/link";
export default function Migration(){
 const [message,setMessage]=useState("将本地早报、音频、设置和记录复制到云端，保留本地原件。"),[busy,setBusy]=useState(false);
 return <main style={{maxWidth:600,margin:"15vh auto",padding:24}}><h1>迁移本地数据</h1><p role="status">{message}</p><button disabled={busy} onClick={async()=>{
  setBusy(true);let offset=0;
  try{for(;;){const r=await fetch("/api/migrate-local",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({offset})});const d=await r.json();if(!r.ok)throw Error(d.error||"迁移未完成，可重新运行。");offset=d.processed;setMessage(`已校验 ${d.processed} / ${d.total} 个文件`);if(d.done){setMessage(`完成：${d.total} 个文件已备份并校验，本地原件保留。`);break;}}}
  catch(e){setMessage(e instanceof Error?e.message:"迁移未完成。");}finally{setBusy(false);}
 }}>开始迁移</button><p><Link href="/">返回早报</Link></p></main>;
}
