"use client";
import { useEffect, useRef, useState } from "react";
import { Radio, type VoiceView } from "@/lib/realtime/client";
import { initialCursor } from "@/lib/broadcast/controller";
import { paragraphs, type MorningBrief } from "@/lib/brief/schema";
type Job = {
  status: string;
  date: string;
  stage: string;
  error?: string;
  brief?: MorningBrief;
  fallback?: MorningBrief;
  cloudPending?: boolean;
  budgetSummary?: import("@/lib/budget-fetch").BudgetSummary;
};
import { categoryLabels as labels } from "@/lib/brief/labels";
import { NewsCard } from "@/components/NewsCard";
import { EditorialSettings } from "@/components/EditorialSettings";
import {budgetFetch,resetBudgetDeclines,showBudgetSummary} from "@/lib/budget-fetch";
import {DailyBudget} from "@/components/DailyBudget";
import { BriefDatePicker } from "@/components/BriefDatePicker";
import {BriefManager} from "@/components/BriefManager";
import {AnswerText} from "@/components/AnswerText";
import type { BroadcastLanguage } from "@/lib/realtime/language";
import { useLanguage } from "@/lib/realtime/use-language";
const states: Record<string, string> = {
  idle: "准备就绪",
  broadcasting: "正在播报",
  interrupted: "正在录音 · 点击麦克风发送",
  answering: "正在回答",
  paused: "已暂停 · 说“继续”恢复",
  ended: "已停止",
  error: "连接遇到问题",
};
export default function Home() {
  const [job, setJob] = useState<Job | null>(null),
    [loadError, setLoadError] = useState(""),
    [drawer, setDrawer] = useState(false);
  const [voice, setVoice] = useState<VoiceView>({
    cursor: initialCursor(),
    connected: false,
    connecting: false,
    muted: true,
    error: null,
  });
  const [turns, setTurns] = useState<
      { id: string; role: string; text: string }[]
    >([]),
    [input, setInput] = useState("");
  const radio = useRef<Radio | null>(null);
  const audioOutput = useRef<HTMLAudioElement | null>(null);
  const [selectedDate,setSelectedDate]=useState<string|null>(null);
  const [reloadDate,setReloadDate]=useState(0);
  const [language,setLanguage]=useLanguage();
  const languageRef=useRef<BroadcastLanguage>("zh");
  useEffect(()=>{
    languageRef.current=language;radio.current?.setLanguage(language);
  },[language]);
  function toggleLanguage() {
    const next=language==="zh"?"en":"zh";
    languageRef.current=next;setLanguage(next);radio.current?.setLanguage(next);
  }
  function selectDate(date:string|null) {
    radio.current?.stop();setJob(null);setTurns([]);setInput("");setLoadError("");setSelectedDate(date);setReloadDate(v=>v+1);
  }
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [outputId, setOutputId] = useState("");
  const [outputError, setOutputError] = useState("");
  useEffect(() => {
    let alive = true;
    async function restoreOutput() {
      try {
        const saved = localStorage.getItem("game-daily:output-device");
        if (saved && audioOutput.current?.setSinkId) {
          await audioOutput.current.setSinkId(saved);
          if (alive) setOutputId(saved);
        }
      } catch {
        if (alive) setOutputError("上次使用的播放设备暂不可用，请重新选择。");
      }
    }
    void restoreOutput();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true;
    const update = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (alive) setOutputs(devices.filter(d => d.kind === "audiooutput" && d.deviceId));
      } catch { /* Playback remains available using the system default. */ }
    };
    void update();
    navigator.mediaDevices?.addEventListener("devicechange", update);
    return () => {
      alive = false;
      navigator.mediaDevices?.removeEventListener("devicechange", update);
    };
  }, [voice.connected]);
  async function chooseOutput(id: string) {
    const audio = audioOutput.current;
    if (!audio) return;
    try {
      if (!audio.setSinkId) throw new Error("unsupported");
      await audio.setSinkId(id);
      setOutputId(id);
      setOutputError("");
      try { localStorage.setItem("game-daily:output-device", id); } catch {}
    } catch {
      setOutputError("无法切换这个设备，请在 Windows 声音设置中选择输出设备。");
    }
  }
  const brief = job?.brief || job?.fallback;
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let pollDelay=4000;
      try {
        const response = await fetch(selectedDate?"/api/brief/history?date="+encodeURIComponent(selectedDate):"/api/brief/today", { cache: "no-store" });
        if (!response.ok) throw new Error("暂时无法加载早报");
        const data: Job = await response.json();
        pollDelay=data.status==="ready"?60000:4000;
        if (!alive) return;
        if(data.budgetSummary?.id)showBudgetSummary(data.budgetSummary.id,"本次早报生成",data.budgetSummary);
        setJob((old) =>
          old?.brief?.version && old.brief.version === data.brief?.version && old.status===data.status && old.stage===data.stage && old.error===data.error
            ? old
            : data,
        );
        if (data.status !== "missing") setLoadError("");
        // Advance only an explicitly started cloud job; ordinary reads never start generation.
        if(data.cloudPending){
          const step=await budgetFetch("/api/brief/advance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:data.date})});
          if(!step.ok)throw Error("生成进度暂时无法更新，稍后会重试。");
        }
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : "加载失败");
      }
      if (alive) timer = setTimeout(poll, pollDelay);
    }
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [selectedDate,reloadDate]);
  useEffect(() => {
    if (!brief) return;
    const instance = new Radio(brief, setVoice, (role, text, id) =>
      setTurns((old) => {
        const existing = old.find((t) => t.id === id);
        return existing
          ? old.map((t) => (t.id === id ? { ...t, text: t.text + text } : t))
          : [...old, { id, role, text }];
      }),
      audioOutput.current || undefined,
      languageRef.current,
      true,
      true,
      true,
    );
    radio.current = instance;
    return () => {
      instance.dispose();
      radio.current = null;
    };
  }, [brief?.id, brief?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  async function retry() {
    resetBudgetDeclines();
    setLoadError("");
    if(selectedDate){setReloadDate(v=>v+1);return;}
    const r = await budgetFetch("/api/brief/today", { method: "POST" });
    if (!r.ok) setLoadError((await r.json()).error);
    else
      setJob((j) =>
        j
          ? {
              ...j,
              status: "generating",
              error: undefined,
              stage: "正在重新准备",
            }
          : j,
      );
  }
  const active = brief ? paragraphs(brief)[voice.cursor.index]?.itemId : null;
  useEffect(()=>{if(voice.connected&&active)document.getElementById(active)?.scrollIntoView({behavior:"smooth",block:"center"});},[active,voice.connected]);
  const navigation = (
    <>
      <p className="eyebrow">TODAY / 今日目录</p>
      {brief?.items.map((item, index) => (
        <button
          key={item.id}
          className={"nav-item " + (active === item.id ? "current" : "")}
          onClick={() => {
            document
              .getElementById(item.id)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
            radio.current?.jump(item.id);
            setDrawer(false);
          }}
        >
          <span>
            {item.paragraphs.every((_, n) =>
              voice.cursor.completed.includes(item.id + ":" + n),
            )
              ? "✓"
              : String(index + 1).padStart(2, "0")}
          </span>
          {labels[item.category]}
        </button>
      ))}
      {brief && (
        <button
          className="nav-item"
          onClick={() => {
            document
              .getElementById("signal")
              ?.scrollIntoView({ behavior: "smooth" });
            setDrawer(false);
          }}
        >
          <span>↗</span>今日观察
        </button>
      )}
    </>
  );
  return (
    <div className="app">
      <header>
        <button
          className="brand"
          aria-label="打开今日目录"
          aria-expanded={drawer}
          onClick={() => setDrawer(!drawer)}
        >
          <span className="brand-mark">g.</span>Game Daily
          <span className="mobile-chevron">⌄</span>
        </button>
        <BriefDatePicker value={selectedDate || job?.date || ""} onChange={selectDate} />
      </header>
      <aside className={drawer ? "open" : ""}>
        {navigation}
      </aside>
      <main>
        <details className="sound-settings">
          <summary aria-label="设置" title="设置">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="m9.5 3-.6 2.2-2 .9-2-.6-2.4 4.2 1.6 1.6v2.3l-1.6 1.6 2.4 4.2 2-.6 2 .9.6 2.3h5l.6-2.3 2-.9 2 .6 2.4-4.2-1.6-1.6v-2.3l1.6-1.6-2.4-4.2-2 .6-2-.9-.6-2.2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </summary>
          <div className="sound-panel">
          <h3>声音</h3>
          <label>播放设备
            <select aria-label="播放设备" value={outputId} onChange={e => void chooseOutput(e.target.value)}>
              <option value="">跟随系统默认设备</option>
              {outputs.map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `播放设备 ${i + 1}`}</option>)}
            </select>
          </label>
          {outputError && <p role="alert">{outputError}</p>}
          <audio ref={audioOutput} controls autoPlay aria-label="主播播报声音" />
          <EditorialSettings />
          <DailyBudget />
          </div>
        </details>
        <section className="intro">
          <h1>{selectedDate?"往期早报":"今日早报"}</h1>
          <BriefManager date={selectedDate||job?.date||""} revision={brief?.version} onChange={date=>selectDate(!selectedDate&&date===job?.date?null:date)} onGenerate={()=>void retry()} generating={job?.status==="generating"} canGenerate={!selectedDate} />
        </section>
        {(loadError || job?.error || voice.error) && (
          <div className="notice error" role="alert">
            {loadError || job?.error || voice.error}
            <button
              onClick={() =>
                voice.error
                  ? voice.connected
                    ? radio.current?.resume()
                    : void radio.current?.connect()
                  : void retry()
              }
            >
              重试
            </button>
          </div>
        )}
        {job?.status !== "ready" && !job?.error && !loadError && (
          <div className="notice" role="status">
            <span className="dot pulse" />
            {job?.stage || "正在连接早报服务"}
          </div>
        )}
        {job?.fallback && !job.brief && (
          <p className="notice">
            以下是 {job.fallback.date} 的上一期内容，今天的早报尚未就绪。
          </p>
        )}
        {brief && (
          <>
            <div className="start-row">
              <button
                className="primary"
                disabled={voice.connecting || job?.status !== "ready"}
                onClick={() =>
                  voice.connected
                    ? radio.current?.resume()
                    : void radio.current?.connect()
                }
              >
                {voice.connecting
                  ? "正在连接…"
                  : voice.cursor.index >= paragraphs(brief).length
                    ? "重新播报"
                    : voice.connected
                    ? "继续播报"
                    : selectedDate?"开始这期早报":"开始今天的早报"}{" "}
                <span>↗</span>
              </button>
            </div>
            {brief.items.length < 5 && (
              <p className="editor-note">为保证来源和内容质量，今天精选 {brief.items.length} 条内容。</p>
            )}
            <div className="stories">
              {brief.items.map((item, index) => (
                <NewsCard
                  key={item.id}
                  item={item}
                  index={index}
                  current={active === item.id && voice.connected}
                />
              ))}
            </div>
            <article className="signal" id="signal">
              <h2>今日观察 · 分析</h2>
              <p>{brief.todaysSignal.text}</p>
            </article>
          </>
        )}
        {!!turns.length && (
          <section className="conversation" aria-label="对话记录">
            {turns.map((t) => (
              <div className={"turn " + t.role} key={t.id}>
                <small>{t.role === "user" ? "你" : "Game Daily"}</small>
                  <p><AnswerText text={t.text}/></p>
              </div>
            ))}
          </section>
        )}
      </main>
      <div className="composer-wrap">
        <div className="voice-row">
          <span role="status">
            <i className={"dot " + (voice.connected ? "green" : "")} />
            {voice.preparation || (voice.connecting
              ? "正在连接"
              : !brief
                ? "正在准备早报"
                : states[voice.cursor.mode])}
          </span>
          {voice.connected && (
            <div>
              <button onClick={() => radio.current?.pause()}>暂停</button>
              <button onClick={() => radio.current?.stop()}>停止</button>
            </div>
          )}
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            radio.current?.text(input);
            setInput("");
          }}
        >
          <button type="button" className="language-toggle" aria-label={language==="zh"?"切换为英文播报":"切换为中文播报"} title={language==="zh"?"当前中文，点击切换英文":"当前英文，点击切换中文"} disabled={!voice.muted || voice.cursor.mode==="answering"} onClick={toggleLanguage}>{language==="zh"?"中":"EN"}</button>
          <input
            aria-label="向主播提问"
            placeholder={
              voice.connected
                ? "问问今天的新闻，或输入“继续”…"
                : "开始早报后，可以在这里提问…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!brief || voice.connecting}
          />
          <button
            type="button"
            className="mic"
            aria-label={voice.muted ? "开始录音" : "结束录音并发送"}
            title={voice.muted ? "开始录音" : "结束录音并发送"}
            aria-pressed={!voice.muted}
            disabled={!brief || voice.connecting}
            onClick={() => radio.current?.mute()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              {voice.muted ? <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></> : <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />}
            </svg>
          </button>
          <button
            className="send"
            aria-label="发送问题"
            disabled={!brief || voice.connecting || !input.trim()}
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}
