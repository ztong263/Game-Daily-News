import test from "node:test";
import assert from "node:assert/strict";
import {normalizeImport} from "../lib/brief/normalize-import";
test("import compatibility reuses supplied evidence without promoting planned release",()=>{
 const source={kind:"primary",url:"https://example.com/game"};
 const input={items:[{category:"design",sources:[source],uncertainty:"Demo confirmed; early access planned",gameRadar:{status:"demo / early_access_planned",whyFun:"Fun",whyStudy:"Study",sources:[source]}}]};
 const result=normalizeImport(input) as typeof input;
 assert.equal(result.items[0].category,"game_radar");assert.equal(result.items[0].gameRadar.status,"demo");
 assert.equal((result.items[0].gameRadar as unknown as {officialUrl:string}).officialUrl,source.url);
 assert.equal(input.items[0].category,"design");
 const incomplete=normalizeImport({items:[{gameRadar:{status:"unknown"}}]}) as {items:{gameRadar:Record<string,unknown>}[]};
 assert.equal(incomplete.items[0].gameRadar.officialUrl,undefined);assert.equal(incomplete.items[0].gameRadar.evidence,undefined);
});
