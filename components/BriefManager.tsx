"use client";
import {useEffect,useRef,useState} from "react";
type Version={id:string;version:string;date:string;title:string;sourceType:string;createdAt:string;active:boolean};
const sources:Record<string,string>={generated:"网页生成时间",imported_chatgpt:"ChatGPT 导入",manual:"手动导入"};
export function BriefManager({date,revision,onChange,onGenerate,generating,canGenerate}:{date:string;revision?:string;onChange:(date:string)=>void;onGenerate:()=>void;generating:boolean;canGenerate:boolean}){
 const [versions,setVersions]=useState<Version[]>([]),[selected,setSelected]=useState("");
 const [text,setText]=useState(""),[activate,setActivate]=useState(true),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [refresh,setRefresh]=useState(0);const dialog=useRef<HTMLDialogElement>(null);const requestKey=useRef("");
 useEffect(()=>{if(!date)return;let alive=true;
 void fetch("/api/morning-briefs?date="+encodeURIComponent(date)).then(async r=>{if(!r.ok)throw Error("读取版本失败");return r.json();}).then(data=>{if(alive){setVersions(data.versions);const active=data.versions.find((v:Version)=>v.active);setSelected(active?active.id+":"+active.version:"");}}).catch(()=>{if(alive)setMessage("读取版本失败，请重新打开页面。");});return ()=>{alive=false;};},[date,revision,refresh]);
 async function submit(){setBusy(true);setMessage("");try{
 let brief;try{brief=JSON.parse(text);}catch{throw Error("JSON 格式错误，请检查后再试。");}
 if(!requestKey.current)requestKey.current=crypto.randomUUID();
 const response=await fetch("/api/morning-briefs/import",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":requestKey.current},body:JSON.stringify({brief,activate})});const result=await response.json();
 if(!response.ok)throw Error(result.issues?result.issues.map((i:{path:string[];message:string})=>i.path.join(".")+": "+i.message).join("\n"):result.error);
 setMessage(result.active?"已导入并设为当前早报。":"已导入，可在版本列表中启用。");setText("");requestKey.current="";dialog.current?.close();setRefresh(v=>v+1);onChange(result.date);
 }catch(e){setMessage(e instanceof Error?e.message:"导入失败，请重试。");}finally{setBusy(false);}}
 async function choose(){const version=versions.find(v=>v.id+":"+v.version===selected);if(!version)return;setBusy(true);setMessage("");try{
 const response=await fetch("/api/morning-briefs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date,id:version.id,version:version.version})});const result=await response.json();if(!response.ok)throw Error(result.error);setRefresh(v=>v+1);onChange(date);
 }catch(e){setMessage(e instanceof Error?e.message:"切换失败");}finally{setBusy(false);}}
 return <div className="brief-manager">
 <div className="brief-actions"><button disabled={!canGenerate||generating||busy} onClick={onGenerate}>{generating?"生成中…":"生成早报"}</button><button onClick={()=>{setMessage("");dialog.current?.showModal();}}>导入早报</button></div>
 {versions.length>0&&<div className="brief-versions"><select aria-label="早报版本" value={selected} onChange={e=>setSelected(e.target.value)}>{versions.map(v=><option key={v.id+v.version} value={v.id+":"+v.version}>{sources[v.sourceType]||v.sourceType} · {new Date(v.createdAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}{v.active?" · 当前":""}</option>)}</select>{versions.length>1&&<button disabled={busy||versions.some(v=>v.active&&v.id+":"+v.version===selected)} onClick={()=>void choose()}>设为当前早报</button>}</div>}
 {message&&<p role="status">{message}</p>}
 <dialog ref={dialog} className="brief-import"><h2>导入早报</h2><p>粘贴 MorningBrief JSON。导入不会搜索或生成新闻。</p><textarea aria-label="早报 JSON" rows={13} value={text} onChange={e=>{setText(e.target.value);requestKey.current="";}}/><label><input type="checkbox" checked={activate} onChange={e=>{setActivate(e.target.checked);requestKey.current="";}}/>设为当前早报</label>{message&&<p role="alert">{message}</p>}<div className="brief-actions"><button disabled={busy} onClick={()=>dialog.current?.close()}>取消</button><button disabled={busy||!text.trim()} onClick={()=>void submit()}>{busy?"导入中…":"导入"}</button></div></dialog>
 </div>;
}
