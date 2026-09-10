begin;
select set_config('gd.fixture_owner',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('gd.fixture_owner')::uuid);
set local role service_role;
do $$
declare a uuid:=current_setting('gd.fixture_owner')::uuid; j jsonb; second jsonb;
begin
 perform public.gd_start_generation(a,'2000-01-01','{"runId":"synthetic"}');
 j:=public.gd_claim_generation_step(a,'2000-01-01','first');
 if j is null then raise exception 'claim failed'; end if;
 second:=public.gd_claim_generation_step(a,'2000-01-01','second');
 if second is not null then raise exception 'duplicate claim'; end if;
 perform public.gd_start_generation(a,'2000-01-01','{"runId":"replacement"}');
 if (select payload->>'runId' from public.gd_jobs where owner_id=a and job_key='brief:2000-01-01') <> 'synthetic' then raise exception 'running job overwritten'; end if;
 update public.gd_jobs set status='failed',lease_until=null where owner_id=a;
 perform public.gd_start_generation(a,'2000-01-01','{"runId":"two"}');
 update public.gd_jobs set status='failed' where owner_id=a;
 perform public.gd_start_generation(a,'2000-01-01','{"runId":"three"}');
 update public.gd_jobs set status='failed' where owner_id=a;
 begin
  perform public.gd_start_generation(a,'2000-01-01','{"runId":"four"}');
  raise exception 'limit failed';
 exception when others then if sqlerrm<>'DAILY_LIMIT' then raise; end if; end;
 if has_function_privilege('authenticated','public.gd_claim_generation_step(uuid,date,text)','EXECUTE') then raise exception 'client can claim jobs'; end if;
end $$;
rollback;
