import test from "node:test";
import assert from "node:assert/strict";
import { candidateSchema, selectCandidates } from "../lib/editorial/selection";
import { radarConfig } from "../lib/editorial/radar-config";
import { briefSchema } from "../lib/brief/schema";
import { editorialFormat } from "../lib/editorial/format";
import { contentSchema } from "../lib/brief/schema";

function candidate(name: string) {
  return candidateSchema.parse({candidates:[{
    headline:name,category:"game_radar",eventKey:name,publishedAt:null,
    urls:[`https://example.com/${name}`],evidence:"Official playable demo",relevance:4,
    transferability:5,significance:2,learning:5,novelty:4,sourceQualified:true,reason:"Systems worth studying",
    radar:{gameTitle:name,developer:"Small studio",status:"demo",officialUrl:`https://example.com/${name}`,statusVerified:true,playInterest:4,reception:2},
  }]}).candidates[0];
}
test("Radar requires verified official evidence and learning value, caps at two unique games", () => {
  const a=candidate("a"), b=candidate("b"), c=candidate("c");
  const allowed=new Set([...a.urls,...b.urls,...c.urls]);
  assert.equal(selectCandidates([a,b,c],allowed).length,2);
  assert.equal(selectCandidates([a,{...a,eventKey:"another-review"}],allowed).length,1);
  assert.equal(selectCandidates([{...a,radar:{...a.radar!,statusVerified:false}}],allowed).length,0);
  assert.equal(selectCandidates([a],new Set()).length,0);
  assert.equal(selectCandidates([{...a,learning:1,significance:5,radar:{...a.radar!,reception:5}}],allowed).length,0);
  assert.equal(selectCandidates([a,b],allowed,{...radarConfig,maxPicks:0}).length,0);
});
test("Radar selection configuration can change quality threshold without changing UI", () => {
  const a=candidate("a");
  assert.equal(selectCandidates([a],new Set(a.urls),{...radarConfig,minimumWeightedScore:1}).length,0);
  assert.equal(selectCandidates([a],new Set(a.urls)).length,1);
});
test("Steam tracking URLs match the verified game page without allowing other apps",()=>{
  const a=candidate("a");
  const url="https://store.steampowered.com/app/3602770/Shroom_and_Gloom_Demo/";
  a.urls=[url];a.radar!.officialUrl=url;
  assert.equal(selectCandidates([a],new Set([url+"?snr=1_5_9_"])).length,1);
  assert.equal(selectCandidates([a],new Set([url.replace("3602770","3271280")])).length,0);
});
test("Radar publication needs structured recommendation and official citation", () => {
  const a=candidate("a");
  const item={id:"a",category:"game_radar",headline:"a",summary:"Summary",whyItMatters:"Learning",userRelevance:"Indie",
    paragraphs:["Demo evidence only"],uncertainty:null,design:null,workflow:null,
    sources:[{title:"Official demo",url:a.urls[0],publisher:"Studio",publishedAt:null,kind:"primary"}],
    gameRadar:{gameTitle:"a",developer:"Studio",status:"demo",recommendation:"study",whatIsIt:"Puzzle",whyFun:"Promising idea",whyStudy:"Resource loop",observeWhilePlaying:"Which decision changes the loop?",indieTakeaway:"Reuse a small system",evidence:"Demo, not reviewed",officialUrl:a.urls[0]}};
  const brief={schemaVersion:1,id:"test",version:"1",date:"2026-09-10",timezone:"Australia/Sydney",generatedAt:"2026-09-10T00:00:00Z",locale:"zh-CN",title:"Test",items:[item],todaysSignal:{text:"No forced trend",itemIds:[]},editorNote:""};
  assert.equal(briefSchema.safeParse(brief).success,true);
  assert.equal(briefSchema.safeParse({...brief,items:[{...item,gameRadar:null}]}).success,false);
  assert.equal(briefSchema.safeParse({...brief,items:[{...item,sources:[{...item.sources[0],kind:"reporting"}]}]}).success,false);
  assert.doesNotThrow(() => editorialFormat(contentSchema,"morning_brief"));
  assert.doesNotThrow(() => editorialFormat(candidateSchema,"candidates"));
});
