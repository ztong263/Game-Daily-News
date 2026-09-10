import test from "node:test";
import assert from "node:assert/strict";
import { selectCandidates, candidateSchema } from "../lib/editorial/selection";
import type { z } from "zod";
type Candidate = z.infer<typeof candidateSchema>["candidates"][number];
const c: Candidate = {
  headline: "Tool",
  category: "tools",
  eventKey: "one",
  publishedAt: null,
  urls: ["https://example.com/source"],
  evidence: "Evidence",
  relevance: 5,
  transferability: 5,
  significance: 2,
  learning: 4,
  novelty: 3,
  sourceQualified: true,
  reason: "Useful",
};
const allowed = new Set(c.urls);
test("useful indie workflow outranks a large irrelevant company story", () => {
  const company = {
    ...c,
    eventKey: "two",
    headline: "Company",
    relevance: 1,
    transferability: 0,
    significance: 5,
    learning: 1,
  };
  assert.equal(selectCandidates([company, c], allowed)[0].headline, "Tool");
});
test("duplicates and untraceable or unqualified sources do not enter the brief", () => {
  const result = selectCandidates(
    [
      c,
      { ...c, headline: "Duplicate" },
      { ...c, eventKey: "bad", sourceQualified: false },
      { ...c, eventKey: "unseen", urls: ["https://elsewhere.example"] },
    ],
    allowed,
  );
  assert.equal(result.length, 1);
});
test("quality overrides quota and at most seven candidates are selected", () => {
  assert.equal(selectCandidates([], allowed).length, 0);
  assert.equal(
    selectCandidates(
      Array.from({ length: 12 }, (_, i) => ({ ...c, eventKey: String(i) })),
      allowed,
    ).length,
    7,
  );
});
