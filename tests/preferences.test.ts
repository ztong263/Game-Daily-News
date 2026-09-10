import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultPreferences, preferencesSchema, preferenceInstructions } from "../lib/editorial/preferences";
import { readPreferences, savePreferences } from "../lib/server/preferences";
test("preferences reject empty or impossible selections and invalid input", () => {
  assert.equal(preferencesSchema.safeParse({...defaultPreferences,categories:[]}).success,false);
  assert.equal(preferencesSchema.safeParse({...defaultPreferences,categories:["game_radar"],radarMaxPicks:0}).success,false);
  assert.equal(preferencesSchema.safeParse({...defaultPreferences,radarMaxPicks:3}).success,false);
  assert.equal(preferencesSchema.safeParse({...defaultPreferences,interests:[" "]}).success,false);
  assert.equal(preferencesSchema.safeParse({...defaultPreferences,categories:["tools"],radarMaxPicks:0}).success,true);
});
test("saved editorial settings survive reread and alter research instructions", async () => {
  const previous=process.env.DATA_DIR;
  const directory=await mkdtemp(path.join(tmpdir(),"game-daily-preferences-"));
  process.env.DATA_DIR=directory;
  try {
    assert.deepEqual(await readPreferences(),defaultPreferences);
    const chosen={...defaultPreferences,categories:["tools" as const,"game_radar" as const],radarMaxPicks:1,interests:["Level design"]};
    await savePreferences(chosen);
    assert.deepEqual(await readPreferences(),chosen);
    assert.notEqual(preferenceInstructions(chosen),preferenceInstructions(defaultPreferences));
    await assert.rejects(savePreferences({...chosen,categories:[]}));
    assert.deepEqual(await readPreferences(),chosen);
  } finally {
    if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;
    const target=path.resolve(directory);
    assert.ok(target.startsWith(path.resolve(tmpdir())+path.sep+"game-daily-preferences-"));
    await rm(target,{recursive:true,force:true});
  }
});
