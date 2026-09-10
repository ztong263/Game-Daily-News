import type {RealtimeSessionCreateRequest} from "openai/resources/realtime/realtime";
import { localAccess } from "@/lib/server/access";
import { status } from "@/lib/server/store";
import { z } from "zod";
import { hostInstructions } from "@/lib/realtime/language";
import {pipelineBudget} from "@/lib/editorial/budget";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    localAccess(request);
    if(pipelineBudget().mode === "mock")
      return Response.json({error:"模拟模式不连接语音服务，请使用语音测试模式。"},{status:409});
    if (!process.env.OPENAI_API_KEY)
      return Response.json({ error: "缺少服务端密钥" }, { status: 503 });
    const { sdp, briefId, version, date, language = "zh" } = (await request.json()) as {
      sdp?: string;
      briefId?: string;
      version?: string;
      date?: string;
      language?: "zh" | "en";
    };
    if (typeof sdp !== "string" || sdp.length > 100000 || !sdp.startsWith("v="))
      return Response.json({ error: "无效的语音连接请求" }, { status: 400 });
    if ((date !== undefined && !z.iso.date().safeParse(date).success) || !["zh","en"].includes(language))
      return Response.json({error:"日期或播报语言无效"},{status:400});
    const job = await status(date);
    if (!job.brief)
      return Response.json({ error: "请先准备当天早报" }, { status: 409 });
    if (job.brief.id !== briefId || job.brief.version !== version)
      return Response.json(
        { error: "早报版本已更新，请刷新页面后重试。" },
        { status: 409 },
      );
    const form = new FormData();
    form.set("sdp", sdp);
    form.set(
      "session",
      JSON.stringify({
        type: "realtime",
        model: process.env.REALTIME_MODEL || "gpt-realtime-2.1",
        instructions: hostInstructions(job.brief,language),
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe" },
            turn_detection: null,
          },
          output: { voice: process.env.REALTIME_VOICE || "marin" },
        },
      } satisfies RealtimeSessionCreateRequest),
    );
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY },
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      return Response.json(
        {
          error:
            response.status === 429
              ? "语音服务额度不足或过于频繁"
              : "语音会话创建失败，请检查模型权限并重试",
        },
        { status: 502 },
      );
    return new Response(await response.text(), {
      headers: { "Content-Type": "application/sdp" },
    });
  } catch {
    return Response.json({ error: "语音连接失败，请重试" }, { status: 500 });
  }
}
