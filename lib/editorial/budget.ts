export type PipelineMode = "production" | "preview" | "mock" | "voice-test";
export function pipelineBudget(env: Record<string,string | undefined> = process.env) {
  const mode = env.EDITORIAL_MODE || "production";
  if (!["production", "preview", "mock", "voice-test"].includes(mode)) throw Error("Invalid editorial mode");
  const offline = mode === "mock" || mode === "voice-test";
  const ceiling = mode === "production" ? 8 : 3;
  const calls = Number(env.EDITORIAL_MAX_TOOL_CALLS || (mode === "production" ? 6 : 2));
  if (!Number.isInteger(calls) || calls < 1 || calls > ceiling) throw Error("Invalid search budget");
  const cheap = env.EDITORIAL_DISCOVERY_MODEL || "gpt-5.4-mini";
  return {
    mode: mode as PipelineMode, offline,
    searchCalls: offline ? 0 : calls,
    discoveryModel: cheap,
    shortlistModel: env.EDITORIAL_SHORTLIST_MODEL || cheap,
    finalModel: mode === "production" ? (env.EDITORIAL_FINAL_MODEL || env.EDITORIAL_MODEL || "gpt-6-astra") : cheap,
    discoveryTokens: mode === "preview" ? 3500 : 6000,
    shortlistTokens: mode === "preview" ? 4500 : 7000,
    finalTokens: mode === "preview" ? 8000 : 16000,
  };
}
