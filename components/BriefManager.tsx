"use client";
import {useEffect,useRef,useState} from "react";
import {versionChannel,channelLabels,type BriefChannel,type BriefVersion as Version} from "@/lib/brief/channels";
export function BriefManager({date,revision,onChange,onGenerate,generating,canGenerate}:{date:string;revision?:string;onChange:(date:string)=>void;onGenerate:()=>void;generating:boolean;canGenerate:boolean}){
 const [versions,setVersions]=useState<Version[]>([]),[selected,setSelected]=useState("");
 const [channel,setChannel]=useState<BriefChannel>("gpt");
 const visible=versions.filter(v=>versionChannel(v)===channel);
 const legacy=versions.filter(v=>versionChannel(v)==="legacy");
 const picked=visible.find(v=>v.id+":"+v.version===selected)||visible.find(v=>v.active)||visible.at(-1);
 const activeVersion=versions.find(v=>v.active);
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
 async function choose(version:Version|undefined=picked){if(!version)return;setBusy(true);setMessage("");try{
 const response=await fetch("/api/morning-briefs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date,id:version.id,version:version.version})});const result=await response.json();if(!response.ok)throw Error(result.error);setRefresh(v=>v+1);onChange(date);
 }catch(e){setMessage(e instanceof Error?e.message:"切换失败");}finally{setBusy(false);}}
 return <div className="brief-manager">
 <div className="brief-switch" role="group" aria-label="早报来源">
 {(["gpt","website","json"] as const).map(value=><button key={value} type="button" aria-pressed={channel===value} onClick={()=>{setChannel(value);setMessage("");}}>{channelLabels[value]}</button>)}
 </div>
 <div className="brief-channel-panel">
 {channel==="gpt"&&<div className="brief-channel-heading"><p>在 ChatGPT 发布，打开这里收听。</p><button disabled={busy} onClick={()=>{setRefresh(v=>v+1);onChange(date);}}>刷新早报</button></div>}
 {channel==="website"&&<div className="brief-channel-heading"><p>检索值得关注的资讯，生成早报。</p><button disabled={!canGenerate||generating||busy} onClick={onGenerate}>{generating?"生成中…":"生成早报"}</button></div>}
 {channel==="json"&&<div className="brief-channel-heading"><p>导入已有的早报 JSON。</p><button disabled={busy} onClick={()=>{setMessage("");dialog.current?.showModal();}}>导入 JSON</button></div>}
 {visible.length>0?<div className="brief-versions"><select aria-label={channelLabels[channel]+"版本"} value={picked?picked.id+":"+picked.version:""} onChange={e=>setSelected(e.target.value)}>{visible.map((v,i)=><option key={v.id+v.version} value={v.id+":"+v.version}>{v.title||"早报"} · {new Date(v.createdAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",second:"2-digit"})} · 第{i+1}版{v.active?" · 当前":""}</option>)}</select><button disabled={busy||picked?.active} onClick={()=>void choose()}>{picked?.active?"当前早报":"设为当前早报"}</button></div>:<p className="brief-empty">此日期暂无{channelLabels[channel]}的早报。</p>}
 </div>
 {activeVersion&&versionChannel(activeVersion)!==channel&&<p className="brief-current">正在展示：{channelLabels[versionChannel(activeVersion)]} · {activeVersion.title}</p>}
 {legacy.length>0&&<details className="brief-legacy"><summary>历史导入 · {legacy.length} 版</summary><p>旧记录未区分 GPT 发布与 JSON 导入。</p>{legacy.map((v,i)=><div className="brief-legacy-row" key={v.id+v.version}><span>{v.title||"早报"} · {new Date(v.createdAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",second:"2-digit"})} · 第{i+1}版</span><button disabled={busy||v.active} onClick={()=>void choose(v)}>{v.active?"当前":"设为当前"}</button></div>)}</details>}
 {message&&<p role="status">{message}</p>}
 <dialog ref={dialog} className="brief-import"><h2>导入早报</h2><p>粘贴 MorningBrief JSON。导入不会搜索或生成新闻。</p><textarea aria-label="早报 JSON" rows={13} value={text} onChange={e=>{setText(e.target.value);requestKey.current="";}}/><label><input type="checkbox" checked={activate} onChange={e=>{setActivate(e.target.checked);requestKey.current="";}}/>设为当前早报</label>{message&&<p role="alert">{message}</p>}<div className="brief-actions"><button disabled={busy} onClick={()=>dialog.current?.close()}>取消</button><button disabled={busy||!text.trim()} onClick={()=>void submit()}>{busy?"导入中…":"导入"}</button></div></dialog>
 </div>;
}
