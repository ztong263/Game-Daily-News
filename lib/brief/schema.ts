import { z } from "zod";
export const categorySchema = z.enum(["tools", "industry", "design", "indie", "game_radar"]);
export const gameStatusSchema = z.enum(["released", "early_access", "demo", "announced"]);
export const radarSchema = z.object({
  gameTitle: z.string().min(1),
  developer: z.string().min(1),
  status: gameStatusSchema,
  recommendation: z.enum(["play", "study", "both"]),
  whatIsIt: z.string().min(1),
  whyFun: z.string().min(1),
  whyStudy: z.string().min(1),
  observeWhilePlaying: z.string().min(1),
  indieTakeaway: z.string().min(1),
  evidence: z.string().min(1),
  officialUrl: z.url(),
});
export const sourceSchema = z.object({
  title: z.string().min(1),
  url: z
    .url()
    .refine((v) => new URL(v).protocol === "https:", "HTTPS required"),
  publisher: z.string(),
  publishedAt: z.string().nullable(),
  kind: z.enum(["primary", "interview", "reporting", "sponsored"]),
});
const designSchema = z.object({
  problem: z.string(),
  decision: z.string(),
  behaviour: z.string(),
  experience: z.string(),
  takeaway: z.string(),
});
const workflowSchema = z.object({
  problem: z.string(),
  oldWorkflow: z.string(),
  newWorkflow: z.string(),
  improvement: z.string(),
  limitations: z.string(),
  worthTrying: z.string(),
});
export const itemSchema = z.object({
  eventKey: z.string().nullable().optional(),
  id: z.string().min(1),
  category: categorySchema,
  headline: z.string().min(1),
  summary: z.string().min(1),
  whyItMatters: z.string().min(1),
  userRelevance: z.string().min(1),
  sources: z.array(sourceSchema).min(1),
  paragraphs: z.array(z.string().min(1).max(700)).min(1).max(12),
  uncertainty: z.string().nullable(),
  design: designSchema.nullable(),
  workflow: workflowSchema.nullable(),
  gameRadar: radarSchema.nullable().optional(),
});
export const contentSchema = z.object({
  title: z.string(),
  items: z.array(itemSchema).min(1).max(7),
  todaysSignal: z.object({
    text: z.string().min(1),
    itemIds: z.array(z.string()),
  }),
  editorNote: z.string(),
});
export const briefSchema = contentSchema
  .extend({
    schemaVersion: z.literal(1),
    sourceType: z.enum(["generated","imported_chatgpt","manual"]).optional(),
    ingestionChannel: z.enum(["chatgpt_publish","json_import"]).optional(),
    createdAt: z.iso.datetime().optional(),
    id: z.string(),
    version: z.string(),
    date: z.iso.date(),
    timezone: z.string(),
    generatedAt: z.iso.datetime(),
    locale: z.literal("zh-CN"),
  })
  .superRefine((brief, ctx) => {
    const ids = brief.items.map((x) => x.id);
    const radar = brief.items.filter(x => x.category === "game_radar");
    if (radar.length > 2) ctx.addIssue({code:"custom",message:"At most two Game Radar picks"});
    const games = radar.map(x => x.gameRadar?.gameTitle.trim().toLowerCase());
    if (new Set(games).size !== games.length) ctx.addIssue({code:"custom",message:"Duplicate Game Radar title"});
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Duplicate item IDs" });
    for (const id of brief.todaysSignal.itemIds)
      if (!ids.includes(id))
        ctx.addIssue({ code: "custom", message: "Unknown signal item" });
    for (const item of brief.items) {
      if (item.category === "game_radar" && (!item.gameRadar || !item.sources.some(s => s.kind === "primary" && s.url === item.gameRadar?.officialUrl)))
        ctx.addIssue({code:"custom",message:"Game Radar needs details and a cited official source"});
      if (item.category !== "game_radar" && item.gameRadar)
        ctx.addIssue({code:"custom",message:"Game Radar details require game_radar category"});
      if (item.category === "tools" && !item.workflow)
        ctx.addIssue({ code: "custom", message: "Missing workflow analysis" });
      if (item.category === "design" && !item.design)
        ctx.addIssue({ code: "custom", message: "Missing design analysis" });
    }
  });
export type MorningBrief = z.infer<typeof briefSchema>;
export type BriefItem = z.infer<typeof itemSchema>;
export function dateInZone(now = new Date(), zone = "Australia/Sydney") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function paragraphs(brief: MorningBrief) {
  return [
    ...brief.items.flatMap((item) =>
      item.paragraphs.map((text, index) => ({
        id: item.id + ":" + index,
        itemId: item.id,
        text,
      })),
    ),
    { id: "signal:0", itemId: "signal", text: brief.todaysSignal.text },
  ];
}
