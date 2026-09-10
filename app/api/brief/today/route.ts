import { after } from "next/server";
import { status, latest, runToday } from "@/lib/server/store";
import { localAccess } from "@/lib/server/access";
export const runtime = "nodejs";
export const maxDuration = 800;
export async function GET(request: Request) {
  try {
    localAccess(request);
    const job = await status();
    return Response.json(
      { ...job, fallback: job.status !== "ready" ? await latest() : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "无法读取本地早报" }, { status: 500 });
  }
}
export async function POST(request: Request) {
  try {
    localAccess(request);
    const job = await status();
    if (job.attempts >= 3)
      return Response.json(
        { error: "今日生成次数已达上限，请检查账户或配置。" },
        { status: 429 },
      );
    after(async () => {
      await runToday(true);
    });
    return Response.json({ accepted: true }, { status: 202 });
  } catch {
    return Response.json(
      { error: "仅允许从本机页面发起请求" },
      { status: 403 },
    );
  }
}
