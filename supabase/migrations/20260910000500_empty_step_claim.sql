create or replace function public.gd_claim_generation_step(p_owner uuid,p_date date,p_token text) returns jsonb language plpgsql set search_path='' as $$
declare j public.gd_jobs;
begin
 update public.gd_jobs set status='running',lease_until=now()+interval '90 seconds',payload=payload||jsonb_build_object('step_token',p_token),updated_at=now()
 where owner_id=p_owner and job_key='brief:'||p_date::text and status in ('queued','running') and (lease_until is null or lease_until<now())
 returning * into j;
 if not found then return null; end if;
 return to_jsonb(j);
end $$;
