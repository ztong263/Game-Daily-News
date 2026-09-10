import test from "node:test";
import assert from "node:assert/strict";
import {alreadyCovered} from "../lib/editorial/history";
test("cross-date duplicates match canonical source or event, not company alone",()=>{
 const seen={urls:new Set(["https://example.com/contract"]),events:new Set(["blizzardcontract1900"]),titles:new Set(["originalheadline"])};
 assert.equal(alreadyCovered({headline:"Changed title",urls:["https://example.com/contract?utm_source=news"]},seen),true);
 assert.equal(alreadyCovered({headline:"Other publisher",urls:["https://other.com/story"],eventKey:"blizzard-contract-1900"},seen),true);
 assert.equal(alreadyCovered({headline:"Blizzard announces a new game",urls:["https://example.com/new-game"],eventKey:"blizzard-new-game"},seen),false);
});
