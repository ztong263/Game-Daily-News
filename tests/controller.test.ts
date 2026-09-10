import test from "node:test";
import assert from "node:assert/strict";
import { initialCursor, transition, intent } from "../lib/broadcast/controller";
const ids = ["a:0", "a:1", "b:0"];
test("generation alone never advances, playback then advances once", () => {
  let s = transition(initialCursor(), { type: "resume" }, ids);
  const token = s.active!;
  s = transition(s, { type: "generated", token }, ids);
  assert.equal(s.index, 0);
  s = transition(s, { type: "played", token }, ids);
  assert.equal(s.index, 1);
  assert.equal(transition(s, { type: "played", token }, ids).index, 1);
});
test("interrupt after generation prevents late playback from advancing", () => {
  let s = transition(initialCursor(), { type: "resume" }, ids);
  const old = s.active!;
  s = transition(s, { type: "generated", token: old }, ids);
  s = transition(s, { type: "interrupt" }, ids);
  s = transition(s, { type: "played", token: old }, ids);
  assert.equal(s.index, 0);
  s = transition(s, { type: "resume" }, ids);
  assert.notEqual(s.active, old);
  assert.equal(
    transition(s, { type: "generated", token: old }, ids).generated,
    false,
  );
});
test("repeated continue idempotent and answer does not consume paragraph", () => {
  let s = transition(initialCursor(), { type: "resume" }, ids);
  assert.deepEqual(transition(s, { type: "resume" }, ids), s);
  s = transition(s, { type: "answer" }, ids);
  s = transition(s, { type: "pause" }, ids);
  assert.equal(s.index, 0);
  assert.equal(s.mode, "paused");
});
test("stop/start preserves next position and explicit jump can replay", () => {
  let s = transition(initialCursor(), { type: "jump", index: 2 }, ids);
  s = transition(s, { type: "stop" }, ids);
  s = transition(s, { type: "resume" }, ids);
  assert.equal(s.index, 2);
  const token = s.active!;
  s = transition(s, { type: "played", token }, ids);
  s = transition(s, { type: "generated", token }, ids);
  assert.equal(s.mode, "ended");
  s = transition(s, { type: "jump", index: 0 }, ids);
  assert.equal(s.index, 0);
});
test("intents are explicit and mixed questions are not discarded", () => {
  assert.equal(intent("继续！"), "resume");
  assert.equal(intent("go on"), "resume");
  assert.equal(intent("继续之前解释一下"), "question");
});
