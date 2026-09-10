"use client";
import { useEffect, useRef, useState } from "react";
export function BriefDatePicker({value,onChange}:{value:string;onChange:(date:string|null)=>void}) {
  const [dates,setDates]=useState<string[]>([]);
  const [today,setToday]=useState("");
  const [open,setOpen]=useState(false);
  const [error,setError]=useState("");
  const drag=useRef<{y:number;index:number;moved:boolean}|null>(null);
  const suppressClick=useRef(false);
  useEffect(()=>{
    let alive=true;
    const load=async()=>{try{const response=await fetch("/api/brief/history",{cache:"no-store"});if(!response.ok)throw Error();const data=await response.json();if(alive){setDates([...new Set<string>([data.today,...data.dates])].sort().reverse());setToday(data.today);setError("");}}catch{if(alive)setError("历史记录暂时无法加载");}};
    void load();const timer=setInterval(()=>void load(),60000);
    return ()=>{alive=false;clearInterval(timer);};
  },[]);
  function choose(date:string) {if(date!==value)onChange(date===today?null:date);}
  function step(delta:number) {const index=Math.max(0,dates.indexOf(value||today));const date=dates[Math.max(0,Math.min(dates.length-1,index+delta))];if(date)choose(date);}
  return <div className="date-picker" onKeyDown={e=>{if(e.key==="Escape")setOpen(false);}}>
    <button className="header-date date-trigger" aria-label="选择早报日期" aria-expanded={open} title="按住上下滑动切换，或点击选择日期"
      onPointerDown={e=>{if(e.button!==0)return;suppressClick.current=false;drag.current={y:e.clientY,index:Math.max(0,dates.indexOf(value||today)),moved:false};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const start=drag.current;if(!start)return;const distance=e.clientY-start.y;if(Math.abs(distance)>12)start.moved=true;const offset=Math.trunc(distance/40);const date=dates[Math.max(0,Math.min(dates.length-1,start.index+offset))];if(date&&start.moved){setOpen(false);choose(date);}}}
      onPointerUp={()=>{if(drag.current&&!drag.current.moved)setOpen(v=>!v);suppressClick.current=true;drag.current=null;}}
      onPointerCancel={()=>{drag.current=null;suppressClick.current=true;}}
      onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}setOpen(v=>!v);}}
      onKeyDown={e=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();step(e.key==="ArrowDown"?1:-1);}}}>
      {value || today || "日期"}
    </button>
    {open&&<div className="date-menu" aria-label="已保存的早报">
      {error?<p role="alert">{error}</p>:dates.map(date=><button key={date} aria-current={(value||today)===date?"date":undefined} onClick={()=>{choose(date);setOpen(false);}}>{date}{date===today?" · 今天":""}</button>)}
      {!error&&dates.length===1&&<p>目前只有这一期早报</p>}
    </div>}
  </div>;
}
