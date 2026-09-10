alter table public.gd_briefs add column import_hash text;
create function public.gd_import_brief(p_owner uuid,p_payload jsonb,p_activate boolean,p_key text,p_hash text)
returns jsonb language plpgsql set search_path = '' as $$
declare existing public.gd_briefs; new_id uuid; day date := (p_payload->>'date')::date; active_now boolean;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text || day::text,0));
 select * into existing from public.gd_briefs where owner_id=p_owner and idempotency_key=p_key;
 if found then
   if existing.import_hash is distinct from p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return jsonb_build_object('ok',true,'briefId',existing.payload->>'id','date',existing.brief_date,'active',existing.is_active);
 end if;
 active_now := p_activate or not exists(select 1 from public.gd_briefs where owner_id=p_owner and brief_date=day and is_active);
 if active_now then update public.gd_briefs set is_active=false where owner_id=p_owner and brief_date=day and is_active; end if;
 insert into public.gd_briefs(owner_id,brief_date,version,source_type,payload,is_active,idempotency_key,import_hash)
 values(p_owner,day,p_payload->>'version',p_payload->>'sourceType',p_payload,active_now,p_key,p_hash) returning id into new_id;
 return jsonb_build_object('ok',true,'briefId',p_payload->>'id','date',day,'active',active_now);
end $$;
create function public.gd_activate_brief(p_owner uuid,p_date date,p_id text,p_version text)
returns jsonb language plpgsql set search_path = '' as $$
declare chosen uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text || p_date::text,0));
 select id into chosen from public.gd_briefs where owner_id=p_owner and brief_date=p_date and version=p_version and payload->>'id'=p_id;
 if chosen is null then raise exception 'BRIEF_NOT_FOUND'; end if;
 update public.gd_briefs set is_active=false where owner_id=p_owner and brief_date=p_date and is_active;
 update public.gd_briefs set is_active=true where id=chosen and owner_id=p_owner;
 return jsonb_build_object('ok',true,'briefId',p_id,'date',p_date,'active',true);
end $$;
revoke all on function public.gd_import_brief(uuid,jsonb,boolean,text,text) from public,anon,authenticated;
revoke all on function public.gd_activate_brief(uuid,date,text,text) from public,anon,authenticated;
grant execute on function public.gd_import_brief(uuid,jsonb,boolean,text,text) to service_role;
grant execute on function public.gd_activate_brief(uuid,date,text,text) to service_role;

