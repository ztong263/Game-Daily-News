"use client";
import { useSyncExternalStore } from "react";
import type { BroadcastLanguage } from "./language";
let fallback: BroadcastLanguage = "zh";
function snapshot(): BroadcastLanguage {
  try{return localStorage.getItem("game-daily:language")==="en"?"en":"zh";}catch{return fallback;}
}
function subscribe(callback:()=>void) {
  window.addEventListener("storage",callback);
  window.addEventListener("game-daily-language",callback);
  return ()=>{window.removeEventListener("storage",callback);window.removeEventListener("game-daily-language",callback);};
}
export function useLanguage() {
  const language=useSyncExternalStore(subscribe,snapshot,()=>"zh" as BroadcastLanguage);
  function setLanguage(value:BroadcastLanguage) {
    fallback=value;
    try{localStorage.setItem("game-daily:language",value);}catch{}
    window.dispatchEvent(new Event("game-daily-language"));
  }
  return [language,setLanguage] as const;
}
