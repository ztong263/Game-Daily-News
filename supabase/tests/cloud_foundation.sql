begin;
select set_config('gd.test_owner_a',gen_random_uuid()::text,true);
select set_config('gd.test_owner_b',gen_random_uuid()::text,true);
insert into auth.users(id) values (current_setting('gd.test_owner_a')::uuid),(current_setting('gd.test_owner_b')::uuid);
set local role service_role;
do $$
declare a uuid := current_setting('gd.test_owner_a')::uuid; b uuid := current_setting('gd.test_owner_b')::uuid; p jsonb; r jsonb;
begin
 p := jsonb_build_object('id','synthetic-brief','version','fixture-v1','date','2026-01-01','sourceType','manual');
 r := public.gd_import_brief(a,p,true,'fixture-key','fixture-hash');
 r := public.gd_import_brief(a,p,true,'fixture-key','fixture-hash');
 if (select count(*) from public.gd_briefs where owner_id=a) <> 1 then raise exception 'dedup failed'; end if;
 begin
  perform public.gd_import_brief(a,p,true,'fixture-key','different-hash');
  raise exception 'conflict accepted';
 exception when others then
  if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if;
 end;
 perform public.gd_import_brief(a,p || '{"id":"synthetic-2","version":"fixture-v2"}'::jsonb,false,'fixture-key-2','hash2');
 perform public.gd_activate_brief(a,'2026-01-01','synthetic-2','fixture-v2');
 if (select count(*) from public.gd_briefs where owner_id=a and is_active) <> 1 then raise exception 'activation failed'; end if;
 insert into public.gd_preferences(owner_id,settings) values(a,'{"synthetic":true}'),(b,'{"synthetic":true}');
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('gd.test_owner_a'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('gd.test_owner_a'),'role','authenticated')::text,true);
do $$
begin
 if (select count(*) from public.gd_preferences where owner_id=current_setting('gd.test_owner_a')::uuid) <> 1 then raise exception 'owner read failed'; end if;
 if (select count(*) from public.gd_preferences where owner_id=current_setting('gd.test_owner_b')::uuid) <> 0 then raise exception 'cross owner read allowed'; end if;
 if has_table_privilege('authenticated','public.gd_usage','INSERT') then raise exception 'usage forgery allowed'; end if;
 if has_function_privilege('authenticated','public.gd_import_brief(uuid,jsonb,boolean,text,text)','EXECUTE') then raise exception 'client rpc allowed'; end if;
 if has_table_privilege('anon','public.gd_briefs','SELECT') then raise exception 'anonymous read allowed'; end if;
end $$;
rollback;
