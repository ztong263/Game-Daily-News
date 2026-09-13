"use client";
import {useEffect,useState} from "react";
type Budget={used:number;remaining:number;pending:number;limit:number;generation:number;warning:boolean;date:string};
export function DailyBudget(){
 const [value,setValue]=useState<Budget|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;const refresh=async()=>{try{const r=await fetch("/api/budget",{cache:"no-store"});if(!r.ok)throw Error();const v=await r.json();if(active){setValue(v);setFailed(false);}}catch{if(active)setFailed(true);}};void refresh();const timer=setInterval(()=>void refresh(),15000);return()=>{active=false;clearInterval(timer);};},[]);
 return <section aria-label="每日预算"><h3>每日预算</h3>{value?<><p>今日已计入 ${value.used.toFixed(3)} / ${value.limit.toFixed(2)}</p><p>可用 ${value.remaining.toFixed(3)} · 生成 ${value.generation.toFixed(3)}</p>{value.pending>0&&<p>其中 ${value.pending.toFixed(3)} 为处理中或结果待确认的预留。</p>}{value.warning&&<p role="status">今日预算接近上限，仍可播放已缓存音频。</p>}<small>悉尼时间每天重置；含语音估算，另留 $0.03 余量。以 API 账单为准。</small></>:<p>正在读取预算…</p>}{failed&&<p>预算暂时无法读取，付费请求将以服务器检查为准。</p>}</section>;
}
