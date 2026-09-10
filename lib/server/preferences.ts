import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { preferencesSchema, defaultPreferences } from "../editorial/preferences";
import {pipelineStorage} from "../editorial/storage-context";
const directory = () => path.resolve(process.env.DATA_DIR || "./data");
export async function readPreferences() {
  const storage=pipelineStorage.getStore();if(storage)return storage.preferences();
  try { return preferencesSchema.parse(JSON.parse(await readFile(path.join(directory(),"preferences.json"),"utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(defaultPreferences);
    throw error;
  }
}
export async function savePreferences(input: unknown) {
  const preferences = preferencesSchema.parse(input);
  await mkdir(directory(),{recursive:true});
  const destination = path.join(directory(),"preferences.json");
  const temporary = destination + "." + randomUUID() + ".tmp";
  await writeFile(temporary,JSON.stringify(preferences),"utf8");
  await rename(temporary,destination);
  return preferences;
}
