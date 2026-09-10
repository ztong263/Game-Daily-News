import {candidateSchema} from "./selection";
import {citationKey} from "../brief/source-url";
import type {z} from "zod";
export function compactCandidates(selected:z.infer<typeof candidateSchema>["candidates"], allowed:Set<string>) {
  const keys=new Set([...allowed].map(citationKey));
  return selected.map(c=>({
    headline:c.headline,category:c.category,publishedAt:c.publishedAt,
    evidence:c.evidence,radar:c.radar,
    urls:c.urls.filter(url=>keys.has(citationKey(url))),
  }));
}
