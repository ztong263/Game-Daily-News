export type Mode =
  | "idle"
  | "broadcasting"
  | "interrupted"
  | "answering"
  | "paused"
  | "ended"
  | "error";
export type Cursor = {
  index: number;
  completed: string[];
  mode: Mode;
  epoch: number;
  active: string | null;
  generated: boolean;
  played: boolean;
};
export type Action =
  | { type: "resume" }
  | { type: "interrupt" | "pause" | "stop" | "error" | "answer" }
  | { type: "jump"; index: number }
  | { type: "generated" | "played"; token: string };
export function initialCursor(): Cursor {
  return {
    index: 0,
    completed: [],
    mode: "idle",
    epoch: 0,
    active: null,
    generated: false,
    played: false,
  };
}
export function transition(s: Cursor, a: Action, ids: string[]): Cursor {
  if (a.type === "resume") {
    if (s.mode === "broadcasting") return s;
    if (!ids.length) return { ...s, mode: "ended", active: null };
    // An explicit resume after completion starts a fresh pass; automatic playback
    // only resumes paused cursors, so reaching the end never loops by itself.
    if (s.index >= ids.length) s = { ...s, index: 0, completed: [] };
    const epoch = s.epoch + 1;
    return {
      ...s,
      mode: "broadcasting",
      epoch,
      active: epoch + ":" + ids[s.index],
      generated: false,
      played: false,
    };
  }
  if (a.type === "jump") {
    if (a.index < 0 || a.index >= ids.length) return s;
    return {
      ...s,
      index: a.index,
      mode: "paused",
      epoch: s.epoch + 1,
      active: null,
      generated: false,
      played: false,
    };
  }
  if (a.type === "generated" || a.type === "played") {
    if (s.mode !== "broadcasting" || s.active !== a.token) return s;
    const next = { ...s, [a.type]: true };
    if (!next.generated || !next.played) return next;
    return {
      ...next,
      index: s.index + 1,
      completed: [...new Set([...s.completed, ids[s.index]])],
      mode: s.index + 1 === ids.length ? "ended" : "paused",
      active: null,
    };
  }
  const mode: Mode =
    a.type === "interrupt"
      ? "interrupted"
      : a.type === "answer"
        ? "answering"
        : a.type === "error"
          ? "error"
          : a.type === "stop"
            ? "ended"
            : "paused";
  return {
    ...s,
    mode,
    epoch: s.epoch + 1,
    active: null,
    generated: false,
    played: false,
  };
}
export function intent(text: string): "resume" | "pause" | "stop" | "question" {
  const clean = text
    .trim()
    .toLowerCase()
    .replace(/[。！!?.？,，\s]/g, "");
  if (/^(?:(?:请|好的|好)?(?:继续|继续播放|继续播报)(?:吧|一下)?|(?:please)?(?:continue|goon|resume))$/.test(clean))
    return "resume";
  if (/^(暂停|等一下|pause)$/.test(clean)) return "pause";
  if (/^(停止|结束|stop)$/.test(clean)) return "stop";
  return "question";
}
