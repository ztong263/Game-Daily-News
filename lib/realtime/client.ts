import { paragraphs, type MorningBrief } from "../brief/schema";
import { hostInstructions, languageInstruction, type BroadcastLanguage } from "./language";
import {recordingWav} from "./recording";
import {
  initialCursor,
  transition,
  intent,
  type Cursor,
  type Action,
} from "../broadcast/controller";
type Event = {
  type: string;
  response_id?: string;
  transcript?: string;
  delta?: string;
  response?: { id: string; status: string; metadata?: { token?: string }; usage?:unknown; output?:{type:string;name?:string;call_id?:string;arguments?:string}[] };
  error?: { code?: string };
};
export type VoiceView = {
  cursor: Cursor;
  connected: boolean;
  connecting: boolean;
  muted: boolean;
  error: string | null;
};
export class Radio {
  private questionEpoch=0;
  private recorder:MediaRecorder|null=null;
  private recordingStream:MediaStream|null=null;
  private recordingTimer:ReturnType<typeof setTimeout>|null=null;
  private questionHistory:{role:"user"|"assistant";text:string}[]=[];
  private cancelBudgetQuestion(){
    this.questionEpoch++;
    this.view.connecting=false;
    this.view.muted=true;
    if(this.recordingTimer)clearTimeout(this.recordingTimer);this.recordingTimer=null;
    if(this.recorder){this.recorder.onstop=null;if(this.recorder.state!=="inactive")this.recorder.stop();this.recorder=null;}
    this.recordingStream?.getTracks().forEach(t=>t.stop());this.recordingStream=null;
  }
  private async budgetQuestion(text:string){
    this.pause();const epoch=this.questionEpoch;this.view.connected=true;this.view.error=null;
    this.onText("user",text,crypto.randomUUID());this.act({type:"answer"});
    try{
      const r=await fetch("/api/question",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:this.brief.date,version:this.brief.version,language:this.language,query:text,history:this.questionHistory.slice(-6)})});
      const result=await r.json();if(epoch!==this.questionEpoch)return;if(!r.ok)throw Error(result.error);
      this.onText("assistant",result.text,crypto.randomUUID());this.questionHistory.push({role:"user",text:text.slice(0,2000)},{role:"assistant",text:result.text.slice(0,2000)});
      if(result.audioError)this.view.error=result.audioError;
      if(result.audioUrl&&this.output){this.output.srcObject=null;this.output.src=result.audioUrl;this.output.onended=()=>{if(epoch===this.questionEpoch)this.act({type:"pause"});};await this.output.play();}
      else this.act({type:"pause"});
    }catch(e){if(epoch!==this.questionEpoch)return;this.view.error=e instanceof Error?e.message:"问答失败";this.act({type:"pause"});}
  }
  private async budgetMute(){
    if(this.recorder?.state==="recording"){this.recorder.stop();this.view.muted=true;this.act({type:"answer"});return;}
    if(this.view.connecting||this.view.cursor.mode==="answering")return;
    this.pause();const epoch=this.questionEpoch;this.view.connecting=true;this.view.error=null;this.emit();
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      if(epoch!==this.questionEpoch){stream.getTracks().forEach(t=>t.stop());return;}
      this.recordingStream=stream;const recorder=new MediaRecorder(stream),chunks:Blob[]=[];this.recorder=recorder;
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=()=>{void (async()=>{
        if(this.recordingTimer)clearTimeout(this.recordingTimer);this.recordingTimer=null;this.recorder=null;
        stream.getTracks().forEach(t=>t.stop());this.recordingStream=null;this.view.muted=true;this.act({type:"answer"});
        try{
          const audio=await recordingWav(new Blob(chunks,{type:recorder.mimeType}));if(epoch!==this.questionEpoch)return;
          const form=new FormData();form.set("audio",audio,"question.wav");
          const r=await fetch("/api/transcribe",{method:"POST",body:form});const result=await r.json();if(epoch!==this.questionEpoch)return;if(!r.ok)throw Error(result.error);
          if(!result.text?.trim())throw Error("没有识别到问题，请重新录音。");await this.text(result.text);
        }catch(e){if(epoch!==this.questionEpoch)return;this.view.error=e instanceof Error?e.message:"录音失败";this.act({type:"pause"});}
      })();};
      recorder.start();this.recordingTimer=setTimeout(()=>{if(recorder.state==="recording")recorder.stop();},45000);
      this.view.connected=true;this.view.connecting=false;this.view.muted=false;this.act({type:"interrupt"});
    }catch{this.view.connecting=false;this.view.error="无法开始录音，请允许麦克风权限。";this.act({type:"pause"});}
  }
  private narrationEpoch=0;
  private narrationText=new Set<string>();
  private narrationRequests=new Map<string,Promise<{url:string;text:string}>>();
  private prepareNarration(index:number,language=this.language){
    const key=`${language}:${index}`;
    const existing=this.narrationRequests.get(key);if(existing)return existing;
    const request=(async()=>{
      const response=await fetch("/api/speech",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:this.brief.date,version:this.brief.version,index,language})});
      const result=await response.json();if(!response.ok)throw Error(result.error);
      return result as {url:string;text:string};
    })();
    this.narrationRequests.set(key,request);
    void request.catch(()=>{if(this.narrationRequests.get(key)===request)this.narrationRequests.delete(key);});
    return request;
  }
  private async playNarration(){
    if(!this.view.muted||this.awaitingTranscript||this.view.cursor.mode==="broadcasting")return;
    // Returning from questions releases the paid live session before fixed playback.
    if(this.pc){this.cancel();this.cleanup();}
    const audio=this.output;if(!audio)return;
    this.view.connected=true;this.view.error=null;
    this.act({type:"resume"});const token=this.view.cursor.active;if(!token)return;
    const epoch=++this.narrationEpoch;const index=this.view.cursor.index;
    try{
      const result=await this.prepareNarration(index);
      if(epoch!==this.narrationEpoch)return;
      audio.srcObject=null;audio.src=result.url;audio.onplaying=null;
      audio.onended=()=>{if(epoch!==this.narrationEpoch)return;this.act({type:"played",token});if(this.view.cursor.mode==="paused")void this.playNarration();};
      this.act({type:"generated",token});await audio.play();
      if(epoch!==this.narrationEpoch)return;
      const id=`narration:${this.brief.version}:${this.language}:${index}`;
      if(!this.narrationText.has(id)){this.narrationText.add(id);this.onText("assistant",result.text,id);}
      // Only one paragraph ahead: overlap synthesis with listening without generating the whole brief.
      if(index+1<this.parts.length){
        void this.prepareNarration(index+1).then(async next=>{
          if(epoch!==this.narrationEpoch)return;
          const download=await fetch(next.url,{cache:"force-cache"});
          if(download.ok)await download.arrayBuffer();
        }).catch(()=>{});
      }
    }catch(e){if(epoch!==this.narrationEpoch)return;this.view.error=e instanceof Error?e.message:"无法播放音频";this.act({type:"pause"});}
  }
  private usageRunId=crypto.randomUUID();
  private searchedCalls=new Set<string>();
  private async playAnswerAudio(){
    const audio=this.audio;
    if(!audio?.srcObject)return;
    try{await audio.play();}catch{
      this.view.error="回答声音被浏览器暂停，请在声音设置中点击播放。";this.emit();
    }
  }
  private async searchAnswer(call:{call_id?:string;arguments?:string},token:string){
    if(!call.call_id||this.searchedCalls.has(call.call_id))return;
    this.searchedCalls.add(call.call_id);this.answerId=null;this.act({type:"answer"});
    const generation=this.generation;
    let result:{text?:string;error?:string;sources?:{title:string;url:string}[]};
    try{
      const {query}=JSON.parse(call.arguments||"{}");
      const response=await fetch("/api/realtime/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:this.brief.date,version:this.brief.version,language:this.language,query}),signal:AbortSignal.timeout(180000)});
      result=await response.json();
      if(!response.ok)result={error:result.error||"搜索失败"};
    }catch{result={error:"联网检索未完成，不能确认最新信息。"};}
    if(!this.live||generation!==this.generation||this.pending!==token)return;
    if(result.sources?.length)this.onText("assistant","联网来源：\n"+result.sources.map(s=>`${s.title}\n${s.url}`).join("\n"),"sources:"+call.call_id);
    this.send({type:"conversation.item.create",item:{type:"function_call_output",call_id:call.call_id,output:JSON.stringify(result)}});
    void this.playAnswerAudio();
    this.send({type:"response.create",response:{metadata:{token},output_modalities:["audio"],tool_choice:"none",instructions:languageInstruction(this.language)+"\n根据刚才的检索结果，用主播口吻直接回答用户的问题并读出来。区分联网补充与分析，不朗读网址。如果检索失败或证据不足，明确说明。回答后停止，等待用户。"}});
  }
  private async recordUsage(response:NonNullable<Event["response"]>){
    if(!response.usage)return;
    const body=JSON.stringify({runId:this.usageRunId,date:this.brief.date,briefId:this.brief.id,responseId:response.id,status:response.status,usage:response.usage});
    for(let attempt=0;attempt<2;attempt++){
      try{const result=await fetch("/api/realtime/usage",{method:"POST",headers:{"Content-Type":"application/json"},body,keepalive:true});if(result.ok)return;}catch{}
    }
    this.view.error="部分语音用量未能保存，本次费用统计可能不完整。";this.emit();
  }
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private live = false;
  private pending: string | null = null;
  private activeResponse: string | null = null;
  private tokens = new Map<string, string>();
  private drain: ReturnType<typeof setTimeout> | null = null;
  private answerId: string | null = null;
  private generation = 0;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private audioMonitor: ReturnType<typeof setInterval> | null = null;
  private recordingStarted = 0;
  private awaitingTranscript = false;
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private transcriptTimer: ReturnType<typeof setTimeout> | null = null;
  view: VoiceView = {
    cursor: initialCursor(),
    connected: false,
    connecting: false,
    muted: true,
    error: null,
  };
  private parts;
  constructor(
    private brief: MorningBrief,
    private onChange: (view: VoiceView) => void,
    private onText: (
      role: "user" | "assistant",
      text: string,
      id: string,
    ) => void,
    private output?: HTMLAudioElement,
    private language: BroadcastLanguage = "zh",
    private cachedNarration = false,
    private budgetedQuestions = false,
  ) {
    this.parts = paragraphs(brief);
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(this.key()) || "null",
      ) as { index: number; completed: string[] } | null;
      if (
        saved &&
        Number.isInteger(saved.index) &&
        saved.index >= 0 &&
        saved.index <= this.parts.length &&
        Array.isArray(saved.completed)
      )
        this.view.cursor = {
          ...initialCursor(),
          index: saved.index,
          completed: saved.completed,
          mode: "paused",
        };
    } catch {}
  }
  private key() {
    return "game-daily:" + this.brief.id + ":" + this.brief.version;
  }
  private emit() {
    this.onChange({ ...this.view, cursor: { ...this.view.cursor } });
    try {
      sessionStorage.setItem(this.key(), JSON.stringify(this.view.cursor));
    } catch {}
  }
  private act(action: Action) {
    this.view.cursor = transition(
      this.view.cursor,
      action,
      this.parts.map((p) => p.id),
    );
    this.emit();
    if(this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer=null;
    if(this.view.connected && this.view.cursor.mode === "paused" && this.view.muted && !this.awaitingTranscript)
      this.idleTimer=setTimeout(()=>{
        if(this.view.cursor.mode === "paused" && this.view.muted && !this.awaitingTranscript) this.stop();
      },120000);
  }
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private send(event: object) {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(event));
  }
  async connect(forQuestion=false) {
    if(this.cachedNarration&&!forQuestion){this.view.connected=true;this.view.error=null;this.emit();this.resume();return;}
    if (this.view.connecting || this.view.connected) return;
    this.usageRunId=crypto.randomUUID();
    const generation = ++this.generation;
    this.live = true;
    this.view.connecting = true;
    this.view.error = null;
    this.emit();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.mic = stream;
      stream.getTracks().forEach(t => { t.enabled = false; });
      this.view.muted = true;
      this.pc = new RTCPeerConnection();
      this.audio = this.output || new Audio();
      this.audio.autoplay = true;
      this.audio.muted = false;
      this.audio.volume = 1;
      this.audio.onended = null;
      this.audio.onplaying = () => {
        if (this.view.error) {
          this.view.error = null;
          this.emit();
        }
      };
      this.pc.ontrack = (e) => {
        if (this.audio) {
          this.audio.srcObject = e.streams[0] || new MediaStream([e.track]);
          void this.audio
            .play()
            .catch(() => {
              this.view.error = "请在声音设置中点击播放，允许浏览器播放声音。";
              this.pause();
            });
        }
      };
      this.audioMonitor = setInterval(() => {
        const audio = this.audio;
        if (!audio?.dataset || !this.pc) return;
        void this.pc.getStats().then((stats) => {
          stats.forEach((stat) => {
            if (stat.type === "inbound-rtp" && stat.kind === "audio") {
              audio.dataset.receivedBytes = String(stat.bytesReceived ?? 0);
              audio.dataset.audioEnergy = String(stat.totalAudioEnergy ?? 0);
              audio.dataset.audioLevel = String(stat.audioLevel ?? 0);
            }
          });
          audio.dataset.outputVolume = String(audio.volume);
          audio.dataset.outputDevice = audio.sinkId || "default";
        }).catch(() => {});
      }, 1000);
      stream.getTracks().forEach((t) => this.pc!.addTrack(t, stream));
      this.dc = this.pc.createDataChannel("oai-events");
      this.dc.onmessage = (e) => {
        try {
          this.event(JSON.parse(e.data) as Event);
        } catch {
          this.fail("语音事件解析失败，请重连。");
        }
      };
      this.pc.onconnectionstatechange = () => {
        if(!this.live)return;
        const state=this.pc?.connectionState;
        if(state==="connected"&&this.disconnectTimer){clearTimeout(this.disconnectTimer);this.disconnectTimer=null;}
        if(state==="failed")this.fail("语音连接中断，进度已保留，请重试。");
        if(state==="disconnected"&&!this.disconnectTimer)this.disconnectTimer=setTimeout(()=>{
          this.disconnectTimer=null;
          if(this.live&&this.pc?.connectionState==="disconnected")this.fail("语音连接中断，进度已保留，请重试。");
        },8000);
      };
      const opened = new Promise<void>((resolve, reject) => {
        this.connectionTimer = setTimeout(
          () => reject(new Error("连接超时")),
          30000,
        );
        this.dc!.onopen = () => {
          if (this.connectionTimer) clearTimeout(this.connectionTimer);
          resolve();
        };
      });
      void opened.catch(() => {});
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      const result = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdp: offer.sdp,
          briefId: this.brief.id,
          version: this.brief.version,
          date: this.brief.date,
          language: this.language,
        }),
        signal: AbortSignal.timeout(35000),
      });
      if (!result.ok) {
        const body = await result.json();
        throw new Error(body.error || "无法连接语音");
      }
      if (generation !== this.generation) return;
      await this.pc.setRemoteDescription({
        type: "answer",
        sdp: await result.text(),
      });
      await opened;
      if (generation !== this.generation) return;
      this.view.connected = true;
      this.view.connecting = false;
      this.updateLanguageSession();
      this.emit();
      if(!forQuestion)this.resume();
    } catch (e) {
      if (generation === this.generation)
        this.fail(e instanceof Error ? e.message : "麦克风或语音连接失败");
    }
  }
  private fail(message: string) {
    this.cleanup();
    this.view.error = message;
    this.act({ type: "error" });
  }
  private cancel() {
    if (this.commitTimer) clearTimeout(this.commitTimer);
    if (this.transcriptTimer) clearTimeout(this.transcriptTimer);
    this.commitTimer = null;
    this.transcriptTimer = null;
    this.awaitingTranscript = false;
    this.view.muted = true;
    this.mic?.getTracks().forEach(t => { t.enabled = false; });
    if (this.drain) clearTimeout(this.drain);
    this.drain = null;
    if (this.activeResponse)
      this.send({ type: "response.cancel", response_id: this.activeResponse });
    this.send({ type: "output_audio_buffer.clear" });
    this.pending = null;
    this.answerId = null;
  }
  resume() {
    if(this.budgetedQuestions)this.cancelBudgetQuestion();
    if(this.cachedNarration){void this.playNarration();return;}
    if (!this.view.muted || this.awaitingTranscript) return;
    if (this.audio?.srcObject) {
      // Retry inside the user's click gesture if autoplay was blocked.
      void this.audio.play().catch(() => {
        this.view.error = "请在声音设置中点击播放，允许浏览器播放声音。";
        this.emit();
      });
    }
    if (!this.view.connected || this.view.cursor.mode === "broadcasting")
      return;
    this.cancel();
    this.act({ type: "resume" });
    const token = this.view.cursor.active;
    if (!token) return;
    this.pending = token;
    this.send({
      type: "response.create",
      response: {
        metadata: { token },
        output_modalities: ["audio"],
        instructions:
          languageInstruction(this.language) + "\n" +
          "只自然播报下面一个已准备好的段落，保持事实含义。不加开场白，不回答历史问题，不继续下一段。\n" +
          this.parts[this.view.cursor.index].text,
      },
    });
  }
  pause() {
    if(this.budgetedQuestions)this.cancelBudgetQuestion();
    this.narrationEpoch++;this.output?.pause();
    this.cancel();
    this.act({ type: "pause" });
  }
  private updateLanguageSession() {
    this.send({type:"session.update",session:{type:"realtime",instructions:hostInstructions(this.brief,this.language)}});
  }
  setLanguage(language: BroadcastLanguage) {
    if (language === this.language) return;
    this.language = language;
    if(this.cachedNarration){const playing=this.view.cursor.mode==="broadcasting";this.pause();if(this.pc)this.updateLanguageSession();if(playing)this.resume();return;}
    if (!this.view.connected) return;
    const wasBroadcasting = this.view.cursor.mode === "broadcasting";
    this.cancel();
    this.act({type:"pause"});
    this.updateLanguageSession();
    if (wasBroadcasting) this.resume();
  }
  jump(itemId: string) {
    this.narrationEpoch++;this.output?.pause();
    this.cancel();
    this.act({
      type: "jump",
      index: this.parts.findIndex((p) => p.itemId === itemId),
    });
  }
  async mute() {
    if(this.budgetedQuestions){await this.budgetMute();return;}
    if(this.view.connecting||this.awaitingTranscript)return;
    if(this.cachedNarration&&this.view.muted)this.pause();
    if(this.cachedNarration&&!this.pc){this.pause();this.view.connected=false;await this.connect(true);if(!this.view.connected)return;}
    if (!this.view.connected || this.awaitingTranscript) return;
    if (this.view.muted) {
      this.cancel();
      this.act({ type: "interrupt" });
      this.send({ type: "input_audio_buffer.clear" });
      this.recordingStarted = Date.now();
      this.view.muted = false;
      this.mic?.getAudioTracks().forEach(t => { t.enabled = true; });
    } else {
      this.view.muted = true;
      this.mic?.getAudioTracks().forEach(t => { t.enabled = false; });
      if (Date.now() - this.recordingStarted < 300) {
        this.send({ type: "input_audio_buffer.clear" });
        this.act({ type: "pause" });
      } else {
        this.awaitingTranscript = true;
        this.act({ type: "answer" });
        // Allow the last WebRTC audio packets to reach the server before committing.
        this.commitTimer = setTimeout(() => {
          this.commitTimer = null;
          this.send({ type: "input_audio_buffer.commit" });
          this.transcriptTimer = setTimeout(() => {
            this.awaitingTranscript = false;
            this.view.error = "未能识别这次录音，请重新录制。";
            this.act({ type: "pause" });
          }, 30000);
        }, 250);
      }
    }
    this.emit();
  }
  async text(text: string, voice = false) {
    if(this.budgetedQuestions&&intent(text)==="question"){if(text.trim())await this.budgetQuestion(text);return;}
    if(this.cachedNarration&&intent(text)==="question")this.pause();
    if(this.cachedNarration&&intent(text)==="question"&&!this.pc){this.pause();this.view.connected=false;await this.connect(true);if(!this.view.connected)return;}
    if (!text.trim() || !this.view.connected) return;
    this.onText("user", text, crypto.randomUUID());
    const kind = intent(text);
    if (kind === "resume") {
      this.resume();
      return;
    }
    if (kind === "pause") {
      this.pause();
      return;
    }
    if (kind === "stop") {
      this.stop();
      return;
    }
    this.cancel();
    this.act({ type: "answer" });
    if (!voice)
      this.send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      });
    const token = "answer:" + crypto.randomUUID();
    this.pending = token;
    void this.playAnswerAudio();
    this.send({
      type: "response.create",
      response: {
        metadata: { token },
        output_modalities: ["audio"],
        tools:[{type:"function",name:"search_web",description:"Search for facts missing from the brief, current information, or when the user asks to search. Include the subject and context in the query.",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"],additionalProperties:false}}],
        tool_choice:"auto",
        instructions:
          languageInstruction(this.language) + "\n" +
          "面向非程序员的工具使用者回答，先直接解释，再用一个日常工作例子讲清楚。不要只给结论，不堆术语，不复述底层实现。当前故事：" +
          (this.parts[this.view.cursor.index]?.itemId || "今日观察") +
          "。早报不足以回答、涉及最新信息或用户要求搜索时，先调用 search_web，再根据检索结果回答。不要只说早报没有。回答必须有声音，回答后停止，不接着播报。",
      },
    });
  }
  private event(e: Event) {
    if (!this.live) return;
    if (e.type === "input_audio_buffer.speech_started") {
      return;
    }
    if (
      e.type === "conversation.item.input_audio_transcription.completed" &&
      this.awaitingTranscript
    ) {
      this.awaitingTranscript = false;
      if (this.transcriptTimer) clearTimeout(this.transcriptTimer);
      this.transcriptTimer = null;
      if (e.transcript?.trim()) this.text(e.transcript, true);
      else this.act({ type: "pause" });
      return;
    }
    if (e.type === "response.created" && e.response) {
      const token = e.response.metadata?.token;
      if (!token || token !== this.pending) {
        this.send({ type: "response.cancel", response_id: e.response.id });
        return;
      }
      this.tokens.set(e.response.id, token);
      this.activeResponse = e.response.id;
      if (token.startsWith("answer:")) this.answerId = e.response.id;
    }
    if (
      e.type === "response.output_audio_transcript.delta" &&
      e.delta &&
      e.response_id &&
      this.tokens.get(e.response_id) === this.pending
    )
      this.onText("assistant", e.delta, e.response_id);
    if (e.type === "response.done" && e.response) {
      void this.recordUsage(e.response);
      const token = this.tokens.get(e.response.id);
      if (e.response.id === this.activeResponse) this.activeResponse = null;
      const search=e.response.output?.find(item=>item.type==="function_call"&&item.name==="search_web");
      if(search&&e.response.status==="completed"&&token&&token===this.pending){void this.searchAnswer(search,token);return;}
      if (
        e.response.status === "completed" &&
        token === this.view.cursor.active
      )
        this.act({ type: "generated", token: token! });
      else if (e.response.status !== "completed" && token === this.pending) {
        this.pending = null;
        this.act({ type: "pause" });
      }
    }
    if (e.type === "output_audio_buffer.stopped" && e.response_id) {
      const token = this.tokens.get(e.response_id);
      if (e.response_id === this.answerId) {
        this.answerId = null;
        this.act({ type: "pause" });
        return;
      }
      if (token && token === this.view.cursor.active) {
        // The server drain event is later than generation completion. A short grace allows a
        // concurrent speech-start/cancel to freeze the cursor before committing the paragraph.
        this.drain = setTimeout(() => {
          if (token !== this.view.cursor.active) return;
          this.act({ type: "played", token });
          this.pending = null;
          if (this.view.cursor.mode === "paused") this.resume();
        }, 200);
      }
    }
    if (
      e.type === "error" &&
      !["response_cancel_not_active"].includes(e.error?.code || "")
    )
      this.fail("语音服务发生错误，请重试。");
  }
  stop() {
    if(this.budgetedQuestions)this.cancelBudgetQuestion();
    this.narrationEpoch++;this.output?.pause();
    this.cancel();
    this.cleanup();
    this.act({ type: "stop" });
  }
  private cleanup() {
    this.narrationEpoch++;
    if(this.output)this.output.onended=null;
    if(this.disconnectTimer)clearTimeout(this.disconnectTimer);
    this.disconnectTimer=null;
    if(this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer=null;
    if (this.transcriptTimer) clearTimeout(this.transcriptTimer);
    this.transcriptTimer = null;
    if (this.commitTimer) clearTimeout(this.commitTimer);
    this.commitTimer = null;
    this.awaitingTranscript = false;
    if (this.audioMonitor) clearInterval(this.audioMonitor);
    this.audioMonitor = null;
    if (this.connectionTimer) clearTimeout(this.connectionTimer);
    this.connectionTimer = null;
    this.live = false;
    this.generation++;
    if (this.drain) clearTimeout(this.drain);
    this.drain = null;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.dc?.close();
    this.pc?.close();
    if (this.audio) {
      this.audio.onplaying = null;
      this.audio.pause();
      this.audio.srcObject = null;
    }
    this.mic = null;
    this.dc = null;
    this.pc = null;
    this.audio = null;
    this.pending = null;
    this.activeResponse = null;
    this.tokens.clear();
    this.view.connected = false;
    this.view.connecting = false;
    this.view.muted = true;
  }
}
