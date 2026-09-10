import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { briefSchema, type MorningBrief, dateInZone } from "../brief/schema";
import { generateBrief } from "../editorial/generate";
import { acquireLock, ownerAlive } from "./lock";
import { publicError } from "./openai";
import {pipelineBudget} from "../editorial/budget";
import {recordUsage} from "../editorial/telemetry";
import {canonical,readVersions,versionsOf,writeVersions} from "./brief-versions";
export type Job = {
  status: "missing" | "generating" | "ready" | "failed";
  date: string;
  stage: string;
  updatedAt: number;
  attempts: number;
  brief?: MorningBrief;
  error?: string;
};
const root = () => path.resolve(process.env.DATA_DIR || "./data", pipelineBudget().mode === "preview" ? "preview" : ".");
const file = (date: string) => path.join(root(), date + ".json");
async function read(date: string): Promise<Job | null> {
  try {
    return JSON.parse(await readFile(file(date), "utf8")) as Job;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
async function save(job: Job) {
  const doc=await readVersions(job.date);const versions=versionsOf(doc);
  if(job.brief){job={...job,brief:canonical(job.brief)};if(!versions.some(b=>b.id===job.brief!.id&&b.version===job.brief!.version))versions.push(job.brief!);}
  await writeVersions({...doc,...job,versions});
}
export function today() {
  return dateInZone(
    new Date(),
    process.env.BRIEF_TIMEZONE || "Australia/Sydney",
  );
}
export async function status(date = today()): Promise<Job> {
  const job = await read(date);
  if (!job)
    return {
      date,
      status: "missing",
      stage: "等待准备",
      updatedAt: Date.now(),
      attempts: 0,
    };
  if (job.brief) job.brief = briefSchema.parse(job.brief);
  if (
    job.status === "generating" &&
    (Date.now() - job.updatedAt > 15 * 60_000 ||
      !(await ownerAlive(path.join(root(), date + ".lock"))))
  )
    return { ...job, status: "failed", error: "准备任务中断，请重试。" };
  return job;
}
export async function latest() {
  await mkdir(root(), { recursive: true });
  const names = (await readdir(root()))
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .sort()
    .reverse();
  for (const name of names) {
    const job = await read(name.slice(0, 10));
    if (job?.brief) return briefSchema.parse(job.brief);
  }
  return null;
}
export async function historyDates() {
  await mkdir(root(), {recursive:true});
  const dates:string[]=[];
  for (const name of (await readdir(root())).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse()) {
    try {
      const job=await read(name.slice(0,10));
      if(job?.brief && briefSchema.safeParse(job.brief).success && job.brief.date===name.slice(0,10)) dates.push(job.brief.date);
    } catch { /* An invalid archive must not hide other available dates. */ }
  }
  return dates;
}
export async function runToday(force=false) {
  return runDate(today(),force);
}
export async function runDate(date:string,force=false) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date || date>today()) throw Error("Invalid archive date");
  await mkdir(root(), { recursive: true });
  const lock = path.join(root(), date + ".lock");
  const previous = await status(date);
  if((previous.brief&&!force) || pipelineBudget().offline) {
    await recordUsage(date,"daily",undefined,!!previous.brief);
    return;
  }
  const release = await acquireLock(lock);
  if (!release) return;
  try {
    const current = await read(date);
    const existing = current?.updatedAt === previous.updatedAt ? previous : await status(date);
    if ((existing.status === "ready"&&!force) || existing.status === "generating") return;
    if (existing.attempts >= 3)
      throw new Error("今日已达三次生成上限，请检查配置后由维护者重置。");
    let job: Job = {
      date,
      status: "generating",
      stage: "正在准备候选内容",
      updatedAt: Date.now(),
      attempts: existing.attempts + 1,
      brief: existing.brief,
    };
    await save(job);
    try {
      const prior = (await readdir(root()))
        .filter(
          (n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n) && n.slice(0,10)<date,
        )
        .sort()
        .reverse()
        .slice(0, 14);
      const history: string[] = [];
      for (const name of prior) {
        const j = await read(name.slice(0, 10));
        j?.brief?.items.forEach((i) =>
          history.push(
            i.headline + " " + i.sources.map((s) => s.url).join(" "),
          ),
        );
      }
      const { brief, audit } = await generateBrief(
        date,
        process.env.BRIEF_TIMEZONE || "Australia/Sydney",
        history,
        async (stage) => {
          job = { ...job, stage, updatedAt: Date.now() };
          await save(job);
        },
      );
      await writeFile(
        path.join(root(), date + ".audit.json"),
        JSON.stringify(audit),
      );
      await save({
        ...job,
        status: "ready",
        stage: "早报已准备好",
        brief,
        updatedAt: Date.now(),
      });
    } catch (error) {
      await recordUsage(date,"generation-failed").catch(()=>{});
      const info = error as { name?: string; status?: number; code?: string };
      console.warn("editorial_failed", {
        name: info.name,
        status: info.status,
        code: info.code,
        detail: error instanceof Error && /^[A-Za-z ]+$/.test(error.message) ? error.message : undefined,
      });
      await save({
        ...job,
        status: job.brief ? "ready" : "failed",
        stage: "准备失败",
        error: publicError(error),
        updatedAt: Date.now(),
      });
    }
  } finally {
    await release();
  }
}
