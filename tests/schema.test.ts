import test from "node:test";
import assert from "node:assert/strict";
import { briefSchema, dateInZone } from "../lib/brief/schema";
const item = {
  id: "one",
  category: "industry",
  headline: "演示",
  summary: "仅用于测试",
  whyItMatters: "测试",
  userRelevance: "测试",
  sources: [
    {
      title: "Source",
      url: "https://example.com",
      publisher: "Example",
      publishedAt: null,
      kind: "primary",
    },
  ],
  paragraphs: ["测试段落"],
  uncertainty: null,
  design: null,
  workflow: null,
};
const brief = {
  schemaVersion: 1,
  id: "test",
  version: "1",
  date: "2026-09-10",
  timezone: "Australia/Sydney",
  generatedAt: "2026-09-09T23:00:00.000Z",
  locale: "zh-CN",
  title: "测试",
  items: [item],
  todaysSignal: { text: "没有共同趋势", itemIds: ["one"] },
  editorNote: "测试",
};
test("valid brief accepts and duplicates fail", () => {
  assert.equal(briefSchema.safeParse(brief).success, true);
  assert.equal(
    briefSchema.safeParse({ ...brief, items: [item, item] }).success,
    false,
  );
});
test("unsafe citations and missing tool analysis fail", () => {
  assert.equal(
    briefSchema.safeParse({
      ...brief,
      items: [
        {
          ...item,
          sources: [{ ...item.sources[0], url: "javascript:alert(1)" }],
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    briefSchema.safeParse({ ...brief, items: [{ ...item, category: "tools" }] })
      .success,
    false,
  );
});
test("Sydney date handles midnight and daylight savings", () => {
  assert.equal(dateInZone(new Date("2026-09-09T14:30:00Z")), "2026-09-10");
  assert.equal(dateInZone(new Date("2026-12-09T13:30:00Z")), "2026-12-10");
});
