import test from "node:test";
import assert from "node:assert/strict";
import { Radio } from "../lib/realtime/client";
import type { MorningBrief } from "../lib/brief/schema";
const brief: MorningBrief = {
  schemaVersion: 1,
  id: "fixture",
  version: "1",
  date: "2026-09-10",
  timezone: "Australia/Sydney",
  generatedAt: "2026-09-10T00:00:00Z",
  locale: "zh-CN",
  title: "fixture",
  items: [],
  todaysSignal: { text: "Test signal", itemIds: [] },
  editorNote: "",
};
test("budgeted questions speak answers, preserve narration progress and ignore replies after stop",async()=>{
 const original=globalThis.fetch;let played=0;let delayed=false;let finish:(r:Response)=>void=()=>{};
 const audio={srcObject:null,src:"",play:async()=>{played++;},pause(){},onended:null as null|(()=>void)};
 globalThis.fetch=async(url)=>{assert.equal(url,"/api/question");if(delayed)return new Promise(r=>{finish=r;});return Response.json({text:"Answer",audioUrl:"/answer.mp3"});};
 const radio=new Radio(brief,()=>{},()=>{},audio as unknown as HTMLAudioElement,"zh",true,true);
 try{
  await radio.text("Explain this news");assert.equal(played,1);assert.equal(radio.view.cursor.index,0);audio.onended?.();assert.equal(radio.view.cursor.mode,"paused");
  delayed=true;const pending=radio.text("Another question");radio.stop();finish(Response.json({text:"Late",audioUrl:"/late.mp3"}));await pending;assert.equal(played,1);
 }finally{radio.stop();globalThis.fetch=original;}
});
test("cached narration never connects realtime and ignores a response after pause",async()=>{
 const original=globalThis.fetch;let finish:(r:Response)=>void=()=>{};let played=0;const messages:string[]=[];
 const audio={srcObject:null,src:"",play:async()=>{played++;},pause(){},onended:null as null|(()=>void)};
 globalThis.fetch=async(url)=>{assert.equal(url,"/api/speech");return new Promise<Response>(resolve=>{finish=resolve;});};
 const radio=new Radio(brief,()=>{},(_role,text)=>messages.push(text),audio as unknown as HTMLAudioElement,"zh",true);
 try{
 await radio.connect();radio.pause();finish(Response.json({url:"/cached.mp3",text:"Test signal"}));await new Promise(r=>setTimeout(r,0));assert.equal(played,0);
 radio.resume();finish(Response.json({url:"/cached.mp3",text:"Test signal"}));await new Promise(r=>setTimeout(r,0));assert.equal(played,1);assert.deepEqual(messages,["Test signal"]);
 audio.onended?.();assert.equal(radio.view.cursor.index,1);
 }finally{radio.stop();globalThis.fetch=original;}
});
test("narration prepares only one paragraph ahead and reuses it without revealing text early",async()=>{
 const original=globalThis.fetch;const requests:number[]=[];const messages:string[]=[];
 const fixture={...brief,items:[{id:"story",paragraphs:["First","Second","Third"]}]} as MorningBrief;
 const audio={srcObject:null,src:"",play:async()=>{},pause(){},onended:null as null|(()=>void)};
 globalThis.fetch=async(_url,options)=>{
   if(options?.method!=="POST")return new Response("audio");
   const {index}=JSON.parse(options.body as string);requests.push(index);
   return Response.json({url:`/audio-${index}.mp3`,text:`Paragraph ${index}`});
 };
 const radio=new Radio(fixture,()=>{},(_role,text)=>messages.push(text),audio as unknown as HTMLAudioElement,"zh",true);
 const flush=()=>new Promise(r=>setTimeout(r,0));
 try{
   await radio.connect();await flush();
   assert.deepEqual(requests,[0,1]);assert.deepEqual(messages,["Paragraph 0"]);
   audio.onended?.();await flush();
   assert.equal(audio.src,"/audio-1.mp3");assert.deepEqual(requests,[0,1,2]);
   assert.deepEqual(messages,["Paragraph 0","Paragraph 1"]);
   radio.pause();await flush();assert.deepEqual(requests,[0,1,2]);
 }finally{radio.stop();globalThis.fetch=original;}
});
test("streamless remote track plays through the page audio element", async () => {
  const keys = ["navigator", "RTCPeerConnection", "MediaStream", "fetch"] as const;
  const originals = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const remoteTrack = { kind: "audio" };
  let played = 0;
  const output = {
    autoplay: false, muted: true, volume: 0, srcObject: null,
    play: async () => { played++; }, pause() {},
  };
  const sent: {type: string; response?:{instructions?:string}}[] = [];
  const track = {enabled: true, stop() {}};
  const channel = { readyState: "open", onopen: () => {}, onmessage: (_e: {data: string}) => { void _e; }, send(data: string) { sent.push(JSON.parse(data)); }, close() {} };
  class Peer {
    ontrack: (event: object) => void = () => {};
    addTrack() {}
    createDataChannel() { return channel; }
    async createOffer() { return { sdp: "v=0" }; }
    async setLocalDescription() {}
    async setRemoteDescription() {
      this.ontrack({ streams: [], track: remoteTrack });
      channel.onopen();
    }
    close() {}
  }
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    mediaDevices: { getUserMedia: async () => ({getTracks: () => [track], getAudioTracks: () => [track]}) },
  }});
  Object.defineProperty(globalThis, "RTCPeerConnection", { configurable: true, value: Peer });
  Object.defineProperty(globalThis, "MediaStream", { configurable: true, value: class {
    constructor(public tracks: unknown[]) {}
  }});
  globalThis.fetch = async () => new Response("v=0");
  const radio = new Radio(brief, () => {}, () => {}, output as unknown as HTMLAudioElement);
  try {
    await radio.connect();
    assert.equal(radio.view.connected, true);
    assert.equal(output.muted, false);
    assert.equal(output.volume, 1);
    assert.ok(played > 0);
    assert.deepEqual((output.srcObject as unknown as { tracks: unknown[] }).tracks, [remoteTrack]);
    assert.equal(track.enabled, false, "microphone is off during broadcast");
    const previousToken=radio.view.cursor.active;
    radio.setLanguage("en");
    assert.equal(radio.view.cursor.index,0,"language switch preserves unfinished paragraph");
    assert.notEqual(radio.view.cursor.active,previousToken,"old language events cannot finish new playback");
    assert.match(sent.filter(e=>e.type==="response.create").at(-1)?.response?.instructions || "",/plain English/);
    radio.setLanguage("zh");
    assert.match(sent.filter(e=>e.type==="response.create").at(-1)?.response?.instructions || "",/普通话/);
    channel.onmessage({data: JSON.stringify({type: "input_audio_buffer.speech_started"})});
    assert.equal(radio.view.cursor.mode, "broadcasting", "ambient sound cannot interrupt");
    radio.mute();
    assert.equal(track.enabled, true);
    assert.equal(radio.view.cursor.mode, "interrupted");
    assert.equal(sent.filter(e => e.type === "input_audio_buffer.commit").length, 0);
    await new Promise(resolve => setTimeout(resolve, 320));
    radio.mute();
    assert.equal(track.enabled, false);
    await new Promise(resolve => setTimeout(resolve, 280));
    assert.equal(sent.filter(e => e.type === "input_audio_buffer.commit").length, 1);
    const responses = sent.filter(e => e.type === "response.create").length;
    channel.onmessage({data: JSON.stringify({type: "conversation.item.input_audio_transcription.completed", transcript: "Explain this story"})});
    assert.equal(sent.filter(e => e.type === "response.create").length, responses + 1);
    channel.onmessage({data: JSON.stringify({type: "conversation.item.input_audio_transcription.completed", transcript: "duplicate"})});
    assert.equal(sent.filter(e => e.type === "response.create").length, responses + 1);
    radio.mute();
    radio.pause();
    assert.equal(track.enabled, false, "pause cancels an unfinished recording");
  } finally {
    radio.stop();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
test("cached questions restore audio on every answer and search results cannot resume after pause",async()=>{
 const keys=["navigator","RTCPeerConnection","fetch"] as const;
 const originals=keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
 const sent:{type:string;response?:{metadata:{token:string};output_modalities:string[]};item?:{type:string}}[]=[];const messages:string[]=[];let plays=0;let searches=0;
 let finish:(r:Response)=>void=()=>{};
 const audio={srcObject:null as unknown,src:"",onended:null,play:async()=>{plays++;},pause(){}};
 const channel={readyState:"open",onopen:()=>{},onmessage:(e:{data:string})=>{void e;},send:(s:string)=>sent.push(JSON.parse(s)),close(){}};
 class Peer{
   ontrack:(e:unknown)=>void=()=>{};addTrack(){};close(){}
   createDataChannel(){return channel;}async createOffer(){return {sdp:"v=0"};}async setLocalDescription(){}
   async setRemoteDescription(){this.ontrack({streams:[{}]});channel.onopen();}
 }
 Object.defineProperty(globalThis,"navigator",{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[]})}}});
 Object.defineProperty(globalThis,"RTCPeerConnection",{configurable:true,value:Peer});
 globalThis.fetch=async(url)=>url==="/api/realtime/search"?(searches++,new Promise<Response>(r=>{finish=r;})):new Response("v=0");
 const radio=new Radio(brief,()=>{},(_role,text)=>messages.push(text),audio as unknown as HTMLAudioElement,"zh",true);
 const event=(e:object)=>channel.onmessage({data:JSON.stringify(e)});
 const flush=()=>new Promise(r=>setTimeout(r,0));
 try{
   await radio.text("Explain this");const first=plays;
   await radio.text("What changed today?");assert.ok(plays>first,"existing remote stream is explicitly resumed");
   const token=sent.filter(e=>e.type==="response.create").at(-1)!.response!.metadata.token;
   event({type:"response.created",response:{id:"answer",metadata:{token}}});
   const done={type:"response.done",response:{id:"answer",status:"completed",output:[{type:"function_call",name:"search_web",call_id:"search1",arguments:JSON.stringify({query:"latest changes"})}]}};
   event(done);event(done);assert.equal(searches,1);
   finish(Response.json({text:"Verified",sources:[{title:"Official",url:"https://example.com"}]}));await flush();
   assert.ok(sent.some(e=>e.item?.type==="function_call_output"));assert.ok(messages.some(t=>t.includes("https://example.com")));
   assert.equal(sent.at(-1)!.response!.output_modalities[0],"audio");
   event({type:"response.created",response:{id:"answer2",metadata:{token}}});
   event({type:"response.done",response:{id:"answer2",status:"completed",output:[{type:"function_call",name:"search_web",call_id:"search2",arguments:'{"query":"more"}'}]}});
   radio.pause();const count=sent.length;finish(Response.json({text:"Late"}));await flush();assert.equal(sent.length,count);
 }finally{radio.stop();for(const [key,d] of originals){if(d)Object.defineProperty(globalThis,key,d);else Reflect.deleteProperty(globalThis,key);}}
});
test("microphone denial returns recoverable error without API call", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => {
          throw new Error("Microphone denied");
        },
      },
    },
  });
  try {
    const radio = new Radio(
      brief,
      () => {},
      () => {},
    );
    await radio.connect();
    assert.equal(radio.view.connecting, false);
    assert.equal(radio.view.connected, false);
    assert.equal(radio.view.cursor.mode, "error");
    assert.match(radio.view.error || "", /denied/);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
  }
});
test("session failure releases microphone and connection", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  const originalPeer = Object.getOwnPropertyDescriptor(
    globalThis,
    "RTCPeerConnection",
  );
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const originalFetch = globalThis.fetch;
  let stopped = false,
    closed = false;
  const track = {
    stop: () => {
      stopped = true;
    },
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => ({ getTracks: () => [track] }),
      },
    },
  });
  Object.defineProperty(globalThis, "RTCPeerConnection", {
    configurable: true,
    value: class {
      addTrack() {}
      createDataChannel() {
        return { readyState: "connecting", close() {} };
      }
      async createOffer() {
        return { sdp: "v=0" };
      }
      async setLocalDescription() {}
      close() {
        closed = true;
      }
    },
  });
  Object.defineProperty(globalThis, "Audio", {
    configurable: true,
    value: class {
      pause() {}
    },
  });
  globalThis.fetch = async () =>
    Response.json({ error: "Session unavailable" }, { status: 503 });
  try {
    const radio = new Radio(
      brief,
      () => {},
      () => {},
    );
    await radio.connect();
    assert.equal(stopped, true);
    assert.equal(closed, true);
    assert.equal(radio.view.cursor.index, 0);
    assert.equal(radio.view.error, "Session unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of [
      ["navigator", originalNavigator],
      ["RTCPeerConnection", originalPeer],
      ["Audio", originalAudio],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
