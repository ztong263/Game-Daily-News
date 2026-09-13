export async function recordingWav(blob:Blob){
 const ctx=new AudioContext();
 try{
  const source=await ctx.decodeAudioData(await blob.arrayBuffer());
  if(source.duration>46)throw Error("录音超过45秒，请缩短问题。");
  const offline=new OfflineAudioContext(1,Math.ceil(source.duration*16000),16000);
  const node=offline.createBufferSource();node.buffer=source;node.connect(offline.destination);node.start();
  const samples=(await offline.startRendering()).getChannelData(0);
  const bytes=new ArrayBuffer(44+samples.length*2),v=new DataView(bytes);
  const str=(offset:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));};
  str(0,"RIFF");v.setUint32(4,36+samples.length*2,true);str(8,"WAVEfmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,"data");v.setUint32(40,samples.length*2,true);
  samples.forEach((sample,i)=>v.setInt16(44+i*2,Math.max(-1,Math.min(1,sample))*32767,true));
  return new Blob([bytes],{type:"audio/wav"});
 }finally{await ctx.close();}
}
