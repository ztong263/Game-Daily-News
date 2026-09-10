import { z } from "zod";
import { categorySchema, gameStatusSchema } from "../brief/schema";
import { radarConfig } from "./radar-config";
import { citationKey } from "../brief/source-url";
export const candidateSchema = z.object({
  candidates: z
    .array(
      z.object({
        headline: z.string().max(300),
        category: categorySchema,
        eventKey: z.string(),
        publishedAt: z.string().nullable(),
        urls: z.array(z.string().url()).max(5),
        evidence: z.string().max(2200),
        relevance: z.number().min(0).max(5),
        transferability: z.number().min(0).max(5),
        significance: z.number().min(0).max(5),
        learning: z.number().min(0).max(5),
        novelty: z.number().min(0).max(5),
        sourceQualified: z.boolean(),
        reason: z.string().max(500),
        radar: z.object({
          gameTitle: z.string().min(1),
          developer: z.string().min(1),
          status: gameStatusSchema,
          officialUrl: z.string(),
          statusVerified: z.boolean(),
          playInterest: z.number().min(0).max(5),
          reception: z.number().min(0).max(5),
        }).nullable().optional(),
      }),
    )
    .max(24),
});
export function selectCandidates(
  candidates: z.infer<typeof candidateSchema>["candidates"],
  allowed: Set<string>,
  config = radarConfig,
) {
  const seen = new Set<string>();
  const normalizedAllowed = new Set([...allowed].map(citationKey));
  const verified = (url:string) => {try{return normalizedAllowed.has(citationKey(url));}catch{return false;}};
  const games = new Set<string>();
  let radarCount = 0;
  const radarScore = (c: z.infer<typeof candidateSchema>["candidates"][number]) => {
    const values = {...c, playInterest:c.radar?.playInterest || 0, reception:c.radar?.reception || 0};
    return Object.entries(config.weights).reduce((sum,[key,weight]) => sum + values[key as keyof typeof config.weights] * weight,0) /
      (5 * Object.values(config.weights).reduce((sum,w) => sum+w,0));
  };
  const score = (c: z.infer<typeof candidateSchema>["candidates"][number]) =>
    c.category === "game_radar" ? radarScore(c) * 55 : c.relevance * 3 +
    c.transferability * 3 +
    c.significance * 2 +
    c.learning * 2 +
    c.novelty;
  const selected = candidates
    .filter((c) => c.sourceQualified && c.urls.some(verified))
    .filter(c => c.category !== "game_radar" || (
      c.radar?.statusVerified && verified(c.radar.officialUrl) && c.urls.includes(c.radar.officialUrl) &&
      c.learning >= config.minimumLearning && c.transferability >= config.minimumTransferability &&
      radarScore(c) >= config.minimumWeightedScore
    ))
    .sort((a, b) => score(b) - score(a))
    .filter((c) => {
      if (seen.has(c.eventKey)) return false;
      if (c.category === "game_radar") {
        const title = c.radar!.gameTitle.trim().toLowerCase();
        if (radarCount >= config.maxPicks || games.has(title)) return false;
        games.add(title);
        radarCount++;
      }
      seen.add(c.eventKey);
      return true;
    })
    .slice(0, 7);
  return selected;
}
