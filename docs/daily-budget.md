# Daily API budget

## Whole-operation consent (supersedes per-request confirmation)

Each generation run, complete playback session, and question turn now has its own owner-scoped operation ID. Consent applies only to that operation and allows all its internal reservations above the reminder threshold. Generation checkpoints keep the run ID across polling. Playback keeps its ID across pause/question/resume and ends on full completion or explicit stop. A voice question shares one ID across transcription, research, answer generation and answer speech. A new question or replay gets a fresh ID. Operation records retain the original Sydney accounting day across midnight. Finishing closes further reservations; already-started work remains counted.

After approved operations end, the browser shows the operation cost, its attributed overage, daily total/overage and any still-uncertain reservations. Summaries include estimates, not an invoice. Server generation summaries are persisted for the next page poll; browser playback/question summaries are delivered after pending requests drain. Closing the browser can prevent its final popup, but ledger charges remain. Regular pause does not end playback consent. No new database schema is needed.

## Development confirmation mode (2026-09-13)

This section supersedes hard-stop descriptions below. USD 0.50 is a reminder, with the estimation margin retained. The generation sublimit is advisory only. Above the current allowance the server returns a confirmation showing booked cost (including pending/estimated amounts) and the requested reservation. Only an explicit browser confirmation increases today's allowance to that projected amount. Later excesses prompt again. Cancelling retains work and does not grant spending permission. Manual retry can reopen a declined prompt. The cloud start path no longer invokes the old three-attempt-limited RPC; it uses owner-scoped optimistic updates and still prevents starting over an active job. Historical attempt counts are retained. No migration or counter reset is necessary.

The authenticated cloud app enforces a shared estimated USD 0.50 daily budget per owner, using Australia/Sydney calendar dates. USD 0.03 is withheld as an estimation margin; generation has a USD 0.20 sublimit. Listening and questions can use the unused total, including generation money when a brief is imported.

## Accounting

Before each paid request, reserve a conservative estimate in an owner-scoped daily row in gd_pipeline_cache. A revision compare-and-swap prevents concurrent tabs from spending the same balance. Unknown outcomes keep their reservations, without automatic expiry or refunds. Returned text usage settles once using input/output token counts and search-call counts, including incomplete responses. Cached playback and completed response checkpoints bypass new reservations.

Prices checked against https://developers.openai.com/api/docs/pricing and the GPT-5.4-mini model page on 2026-09-13: text input $0.75/M, output $4.50/M, search $0.01/call plus tokens. Cloud text generation/translation/questions use gpt-5.4-mini at standard service tier. This intentionally replaces the expensive Astra final-generation default in cloud mode. The old local filesystem generator is not budget-controlled.

Text reservations count UTF-8 bytes plus overhead and a conservative search allowance; built-in search content is not an exact preflight token count. Actual returned usage is charged even when it exceeds the estimate. Binary gpt-4o-mini-tts is estimated conservatively at $0.00012/character, minimum $0.003/request. The estimate remains charged because the binary response exposes no actual token total. Transcription charges a conservative $0.01 per recording, with server validation of mono 16kHz PCM WAV length at no more than 46 seconds (client auto-stop 45 seconds). These are protective estimates, not invoice amounts or an absolute provider billing guarantee.

Existing same-day usage is imported into the first ledger using billing fields only, never content. Unknown historical models or missing usage conservatively consume the daily allowance rather than being treated as free. Operations are attributed to the Sydney day on which their reservation was created, including a request completing after midnight. Other applications using the same API key are outside this ledger.

## Question flow

Cloud UI now records locally, sends the recording for server-controlled transcription, then obtains a text response and TTS. It does not issue a browser-owned Realtime session, because that could bypass per-request budget checks. The legacy cloud session and search endpoints are rejected; reload old tabs after deployment. Search is available to the answer model when facts require it, with at most two calls. A response can still be displayed in text when remaining funds cannot cover speech.

Budget status appears inside the existing settings panel and refreshes every 15 seconds. No new schema or credentials are required; it reuses the existing private cloud cache table. The app does not run new paid requests during tests. Production takes effect after pushing and deploying the code.
# Current behavior: informational budget

The user's latest preference supersedes the approval behavior described below. The $0.50 daily amount is a reference only: generation, narration and Q&A do not pause for budget confirmation, and completion does not display an alert. Reservations, settlement, operation boundaries and duplicate-request checks remain. The settings panel shows estimated spend, pending amounts and the amount over the reference budget, refreshing after operation completion. Provider errors and genuine request failures are still reported; requests are not automatically retried on a 402 response.
