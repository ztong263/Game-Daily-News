"use client";
import { useEffect, useState } from "react";
import { categorySchema } from "@/lib/brief/schema";
import { categoryLabels } from "@/lib/brief/labels";
import { preferencesSchema, type EditorialPreferences } from "@/lib/editorial/preferences";
export function EditorialSettings() {
  const [preferences,setPreferences]=useState<EditorialPreferences | null>(null);
  const [interests,setInterests]=useState("");
  const [message,setMessage]=useState("");
  const [saving,setSaving]=useState(false);
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let alive=true;
    void fetch("/api/settings",{cache:"no-store"}).then(async r=>{
      if(!r.ok)throw Error("读取设置失败");
      const data=preferencesSchema.parse(await r.json());
      if(alive){setPreferences(data);setInterests(data.interests.join("、"));setFailed(false);setMessage("");}
    }).catch(()=>{if(alive){setMessage("读取设置失败");setFailed(true);}});
    return ()=>{alive=false;};
  },[attempt]);
  async function save() {
    if(!preferences)return;
    setSaving(true);setMessage("");
    try {
      const payload={...preferences,interests:interests.split(/[、，,\n]/).map(v=>v.trim()).filter(Boolean)};
      if(!preferencesSchema.safeParse(payload).success)throw Error("请至少保留一个有效方向，关注主题最多12个，每个最多80字。");
      const response=await fetch("/api/settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await response.json();
      if(!response.ok)throw Error(data.error || "保存失败");
      setPreferences(data);setMessage("已保存，下次生成早报时生效。");
    } catch(error){setMessage(error instanceof Error?error.message:"保存失败，请重试");}
    finally {setSaving(false);}
  }
  return <section className="editorial-settings" aria-label="早报偏好">
    <h3>早报内容</h3>
    {!preferences ? <p>{failed?message:"正在读取设置…"}{failed&&<button onClick={()=>setAttempt(v=>v+1)}>重试</button>}</p> : <>
      <fieldset disabled={saving}><legend className="sr-only">内容方向</legend>
        {categorySchema.options.map(category=><label key={category} className="category-choice"><input type="checkbox" checked={preferences.categories.includes(category)} onChange={e=>{setMessage("");setPreferences({...preferences,categories:e.target.checked?[...preferences.categories,category]:preferences.categories.filter(c=>c!==category)});}} />{categoryLabels[category]}</label>)}
        <label>游戏雷达上限<select aria-label="游戏雷达推荐数量" value={preferences.radarMaxPicks} disabled={!preferences.categories.includes("game_radar")} onChange={e=>{setMessage("");setPreferences({...preferences,radarMaxPicks:Number(e.target.value)});}}>{[0,1,2].map(n=><option key={n} value={n}>{n} 款 / 期</option>)}</select></label>
        <label className="interest-label">关注主题<textarea aria-label="关注主题" rows={2} value={interests} onChange={e=>{setInterests(e.target.value);setMessage("");}} placeholder="用逗号分隔，例如：关卡设计、平台跳跃" /></label>
      </fieldset>
      <button className="primary" disabled={saving} onClick={()=>void save()}>{saving?"保存中…":"保存偏好"}</button>
      <p className="settings-note" role="status">{message || "影响下次选题，今天的早报保持不变。"}</p>
    </>}
  </section>;
}
