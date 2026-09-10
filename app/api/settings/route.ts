import { localAccess } from "@/lib/server/access";
import { readPreferences, savePreferences } from "@/lib/server/preferences";
import { preferencesSchema } from "@/lib/editorial/preferences";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { localAccess(request); } catch { return Response.json({error:"无法访问设置"},{status:403}); }
  try { return Response.json(await readPreferences(),{headers:{"Cache-Control":"no-store"}}); }
  catch { return Response.json({error:"读取设置失败，请重试"},{status:500}); }
}
export async function PUT(request: Request) {
  try { localAccess(request); } catch { return Response.json({error:"无法修改设置"},{status:403}); }
  let data: unknown;
  try { data=await request.json(); } catch { return Response.json({error:"设置格式不正确"},{status:400}); }
  const result=preferencesSchema.safeParse(data);
  if (!result.success) return Response.json({error:"至少保留一个有效方向；推荐数量为0–2，关注主题最多12个，每个最多80字。"},{status:400});
  try { return Response.json(await savePreferences(result.data)); }
  catch { return Response.json({error:"保存失败，请重试"},{status:500}); }
}
