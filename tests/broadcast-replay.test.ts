import test from "node:test";
import assert from "node:assert/strict";
import {initialCursor,transition} from "../lib/broadcast/controller";
test("completed broadcasts replay explicitly, reject old completion events and preserve partial progress",()=>{
 const ids=["one"];
 let s=transition(initialCursor(),{type:"resume"},ids);
 const token=s.active!;
 s=transition(s,{type:"generated",token},ids);
 s=transition(s,{type:"played",token},ids);
 assert.equal(s.mode,"ended");assert.equal(s.index,1);
 s=transition(s,{type:"resume"},ids);
 assert.equal(s.mode,"broadcasting");assert.equal(s.index,0);
 assert.deepEqual(s.completed,[]);assert.notEqual(s.active,token);
 assert.deepEqual(transition(s,{type:"played",token},ids),s);
 const stopped=transition({...initialCursor(),index:1},{type:"stop"},["one","two"]);
 assert.equal(transition(stopped,{type:"resume"},["one","two"]).index,1);
 assert.equal(transition(initialCursor(),{type:"resume"},[]).mode,"ended");
});
