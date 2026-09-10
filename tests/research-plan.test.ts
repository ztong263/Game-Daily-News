import test from "node:test";
import assert from "node:assert/strict";
import {researchPlan,radarNote} from "../lib/editorial/research-plan";
import {defaultPreferences} from "../lib/editorial/preferences";
test("radar reserves budget without increasing the total",()=>{
 assert.deepEqual(researchPlan(6,defaultPreferences),{general:3,radar:3});
 assert.deepEqual(researchPlan(3,defaultPreferences),{general:1,radar:2});
 assert.deepEqual(researchPlan(6,{...defaultPreferences,radarMaxPicks:0}),{general:6,radar:0});
 assert.deepEqual(researchPlan(6,{...defaultPreferences,categories:["game_radar"]}),{general:0,radar:6});
});
test("insufficient research never implies there are no worthwhile games",()=>{
 assert.match(radarNote("insufficient",0),/检索不足/);
 assert.match(radarNote("insufficient",0),/不代表没有/);
 assert.match(radarNote("checked",0),/已做游戏专项检索/);
 assert.equal(radarNote("checked",1),"");
 assert.equal(radarNote("disabled",0),"");
});
