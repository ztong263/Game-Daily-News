create function public.gd_claim_speech(p_owner uuid,p_key text,p_token text) returns boolean language plpgsql set search_path='' as $$
declare claimed uuid;
begin
 insert into public.gd_jobs(owner_id,job_key,kind,status,payload,lease_until,attempts)
 values(p_owner,'speech:'||p_key,'speech','running',jsonb_build_object('token',p_token),now()+interval '10 minutes',1)
 on conflict(owner_id,job_key) do update set status='running',payload=jsonb_build_object('token',p_token),lease_until=now()+interval '10 minutes',attempts=public.gd_jobs.attempts+1,updated_at=now()
 where public.gd_jobs.status <> 'running' or public.gd_jobs.lease_until < now()
 returning id into claimed;
 return claimed is not null;
end $$;
revoke all on function public.gd_claim_speech(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gd_claim_speech(uuid,text,text) to service_role;
