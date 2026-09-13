"use client";
import {useEffect,useState} from "react";
type Budget={used:number;remaining:number;pending:number;limit:number;generation:number;warning:boolean;date:string};
export function DailyBudget(){
 const [value,setValue]=useState<Budget|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;const refresh=async()=>{try{const r=await fetch("/api/budget",{cache:"no-store"});if(!r.ok)throw Error();const v=await r.json();if(active){setValue(v);setFailed(false);}}catch{if(active)setFailed(true);}};const onUpdate=()=>void refresh();window.addEventListener("budget-updated",onUpdate);void refresh();const timer=setInterval(()=>void refresh(),15000);return()=>{active=false;clearInterval(timer);window.removeEventListener("budget-updated",onUpdate);};},[]);
 return <section aria-label="每日费用估算"><h3>每日费用估算</h3>{value?<><p>今日估算 ${value.used.toFixed(3)} · 参考预算 ${value.limit.toFixed(2)}</p><p>{value.used>value.limit?`已超出 $${(value.used-value.limit).toFixed(3)}`:`距参考预算 $${value.remaining.toFixed(3)}`} · 生成 ${value.generation.toFixed(3)}</p>{value.pending>0&&<p>其中 ${value.pending.toFixed(3)} 为处理中或结果待确认的预留。</p>}<small>仅作费用参考，不会因超额暂停操作。悉尼时间每天重置，含语音估算，以 API 账单为准。</small></>:<p>正在读取费用…</p>}{failed&&<p>费用暂时无法读取，请稍后查看。</p>}</section>;
}
