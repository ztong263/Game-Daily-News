# ChatGPT publishing connector

This is a tool-only MCP integration, adapted from the official MCP server registration example and Web Standard Streamable HTTP transport. It reuses the cloud import RPC and runtime MorningBrief Zod schema (including cross-field refinements). It does not invoke OpenAI, search, translate, or synthesize audio. Playback remains the existing website action with its existing budget controls.

## Deploy and connect

1. Commit/push these changes and wait for Vercel Ready.
2. In Vercel Production environment variables set `ENABLE_CHATGPT_MCP_PUBLISH=true`. Verify `APP_ORIGIN=https://game-daily-news-myown.vercel.app` (no trailing slash). Existing Supabase server configuration is reused; no keys need to be pasted into ChatGPT. Redeploy after changing environment variables.
3. ChatGPT new plugin: name 游戏早报发布; server URL `https://game-daily-news-myown.vercel.app/mcp`; authentication OAuth.
4. In advanced OAuth settings enter client ID `game-daily-chatgpt`; leave client secret empty. This is a predefined public OAuth client using PKCE S256, not a secret credential. If the UI cannot accept public-client settings, report the screen rather than disabling authentication.
5. Sign in to the website account in the authorization window and select 允许连接. Only the existing verified owner account can consent. The allowed callback is exactly `https://chatgpt.com/connector_platform_oauth_redirect`; issuer identification is advertised and included on success and denial.
6. In a conversation select the plugin, provide a valid brief, and request a test publication with `activate:false` and a unique stable idempotency key. Confirm tool result `ok:true`. Check the website version selector. Repeat the same payload/key: it must not create another version. Different content with the same key must fail.
7. Only after this works, attach the plugin to the existing 08:00 scheduled task and instruct it to publish the completed past-24-hour brief with `activate:true`, stable key `chatgpt-game-daily-YYYY-MM-DD`. A task may still require a ChatGPT approval; this must be tested in the actual account. Local protocol tests do not establish unattended task support.

## Boundaries

- Only `publish_morning_brief` is exposed. No access to history, private data, API keys, SQL, deletion, generation, or billing tools.
- `/mcp` discovery returns public schemas without auth; writes require an access token scoped to `brief:publish` and this exact resource/client.
- `/connect/authorize` uses existing Supabase login and owner checks, explicit same-origin consent, CSRF cookie, exact callback allowlist and PKCE. Login preserves only the authorization continuation path.
- Single-use 5-minute codes; 1-hour access tokens; rotating 30-day refresh tokens. Random token suffixes are hashed in the existing owner-scoped `gd_pipeline_cache` under `oauth:`. Expired records are rejected. No auth.users listing and no new database schema are required.
- `/connect` revokes all publishing grants without touching briefs. `ENABLE_CHATGPT_MCP_PUBLISH=false` disables the endpoint immediately after deployment.
- Request limit 1 MB. Existing atomic import RPC keeps all versions and handles idempotency conflicts. The connector labels incoming content imported_chatgpt. Editorial past-24-hour rules are task instructions; the import endpoint does not fetch source pages to verify publication timestamps.
- Website discovery keeps its original time flexibility. Manual JSON import is unchanged.

## References

- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/plan/tools

## Validation

Automated tests cover MCP tool discovery, valid publication delegation, schema rejection before writes, bounded bodies, OAuth callback/audience/scope/PKCE validation, code replay and refresh replay. Existing import tests cover preserved versions and idempotency with zero external requests. Live ChatGPT authorization, production database import, and the scheduled task require deployment and account-side testing; do not label those completed from local tests.
