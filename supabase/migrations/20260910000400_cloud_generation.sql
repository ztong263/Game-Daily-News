create table public.gd_pipeline_cache (
 owner_id uuid not null references auth.users(id), cache_key text not null,
 payload jsonb not null, expires_at timestamptz, updated_at timestamptz not null default now(),
 primary key(owner_id,cache_key)
);
alter table public.gd_pipeline_cache enable row level security;
revoke all on public.gd_pipeline_cache from public,anon,authenticated;
grant select on public.gd_pipeline_cache to authenticated;
grant select,insert,update,delete on public.gd_pipeline_cache to service_role;
create policy gd_pipeline_owner_read on public.gd_pipeline_cache for select to authenticated using ((select auth.uid())=owner_id);

create function public.gd_start_generation(p_owner uuid,p_date date,p_payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare j public.gd_jobs;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('generation:'||p_owner::text||p_date::text,0));
 select * into j from public.gd_jobs where owner_id=p_owner and job_key='brief:'||p_date::text;
 if found and j.status in ('queued','running') then return to_jsonb(j); end if;
 if found and j.attempts>=3 then raise exception 'DAILY_LIMIT'; end if;
 insert into public.gd_jobs(owner_id,job_key,kind,status,payload,attempts)
 values(p_owner,'brief:'||p_date::text,'brief','queued',p_payload,1)
 on conflict(owner_id,job_key) do update set status='queued',payload=p_payload,attempts=public.gd_jobs.attempts+1,lease_until=null,error_code=null,updated_at=now()
 returning * into j;
 return to_jsonb(j);
end $$;
create function public.gd_claim_generation_step(p_owner uuid,p_date date,p_token text) returns jsonb language plpgsql set search_path='' as $$
declare j public.gd_jobs;
begin
 update public.gd_jobs set status='running',lease_until=now()+interval '90 seconds',payload=payload||jsonb_build_object('step_token',p_token),updated_at=now()
 where owner_id=p_owner and job_key='brief:'||p_date::text and status in ('queued','running') and (lease_until is null or lease_until<now())
 returning * into j;
 return to_jsonb(j);
end $$;
revoke all on function public.gd_start_generation(uuid,date,jsonb) from public,anon,authenticated;
revoke all on function public.gd_claim_generation_step(uuid,date,text) from public,anon,authenticated;
grant execute on function public.gd_start_generation(uuid,date,jsonb) to service_role;
grant execute on function public.gd_claim_generation_step(uuid,date,text) to service_role;
