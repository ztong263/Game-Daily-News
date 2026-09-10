# Cloud migration status

Updated 2026-09-10.

## Completed

- Local development runs in Supabase mode. Hosting is still localhost; Vercel deployment has not been performed.
- Brief reading, history, import, version activation, preferences, synthesis/playback, interactive questions, search and usage use authenticated cloud repositories.
- Generation uses background Responses, cloud checkpoints, research caches, historical deduplication, audit records and atomic publication. Completed responses are reused. Ambiguous request starts stop rather than automatically triggering another billable call.
- The signed-in migration screen completed 64/64 files. Each archived file was downloaded and SHA-256 verified. Local originals remain. Briefs, preferences, audio, translation/research caches and usage are installed in operational stores; diagnostics and backups remain in the private archive. Existing cloud preferences and active versions were preserved.
- Private buckets: game-daily-audio and game-daily-archive. Audio retrieval requires authentication and owner matching.
- Owner RLS, server-only writes, same-origin checks and confirmed owner-email access remain enforced. Migration is development-localhost only.
- SQL migrations 0001–0005 applied. Synthetic lease and duplicate-claim checks passed with rollback; earlier isolation and atomic import checks passed.
- 44 tests, lint and production build pass. Model calls in tests are mocked; real audible playback still needs user confirmation.

## Limits and deployment

- Generation advances through the open page after an explicit request. Closing it leaves submitted background model responses running; later steps resume when the page reopens. This is not an unattended daily scheduler.
- Binary speech responses expose no token counts: missing counts remain null. Browser-reported Realtime usage may be incomplete after an abrupt disconnect. Records are not an authoritative provider invoice.
- Microphone/output-device selection and playback state remain browser-local.
- See vercel-deployment.md. Configure credentials privately; never upload .env.local or data/.
