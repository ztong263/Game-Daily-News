import { api } from "../lib/server/openai";
async function check() {
  try {
    const result = await api().models.list();
    const ids = new Set(result.data.map((m) => m.id));
    console.log(
      JSON.stringify({
        authenticated: true,
        editorialModelAvailable: ids.has(
          process.env.EDITORIAL_MODEL || "gpt-6-astra",
        ),
        realtimeModelAvailable: ids.has(
          process.env.REALTIME_MODEL || "gpt-realtime-2.1",
        ),
      }),
    );
  } catch (error) {
    const e = error as { status?: number; code?: string };
    console.log(
      JSON.stringify({ authenticated: false, status: e.status, code: e.code }),
    );
    process.exitCode = 1;
  }
}
void check();
