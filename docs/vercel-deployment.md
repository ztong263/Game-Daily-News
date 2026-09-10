# Vercel deployment

1. Import the application's repository into Vercel using the Next.js preset. Build: npm run build. Install: npm ci. Keep the default output setting.
2. Privately add existing values for NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, GAME_DAILY_OWNER_EMAIL and OPENAI_API_KEY. Only the two NEXT_PUBLIC variables may be exposed to the browser.
3. Set STORAGE_MODE=supabase and APP_ORIGIN to the exact production HTTPS origin, without a trailing slash. Retain deliberately customized model, budget and timezone settings. Do not transfer DATA_DIR or local filesystem paths.
4. Deploy. Confirm APP_ORIGIN matches the actual domain and redeploy after environment changes. Configure the production Site URL in Supabase Auth for account emails. Current login uses email/password.
5. Sign in with the existing confirmed owner account. Check history, versions and settings. Play a cached paragraph; test questions and new generation when ready for paid API calls.

.vercelignore excludes local data, environment files and build caches. Never commit credentials. Reuse the existing database and private buckets; do not reimport local files.

Generation uses resumable steps advanced by the open page. Reopening resumes later steps. No unattended daily scheduler has been configured. No Vercel deployment has been performed yet.
