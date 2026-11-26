-- Pruebas de la etapa 4: cupo de CLIENTE AI y reportes
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a4', 'ines@siete.test'),
  ('00000000-0000-0000-0000-0000000000b4', 'juan@siete.test'),
  ('00000000-0000-0000-0000-0000000000c4', 'kari@ocho.test');
create table public._t4 (k text primary key, v uuid);
grant all on public._t4 to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false);
insert into public._t4 values ('org', public.create_organization('Siete SA'));
reset role;
-- Juan es vendedor de la misma empresa
insert into public.organization_members (organization_id, user_id, role)
select v, '00000000-0000-0000-0000-0000000000b4', 'seller' from public._t4 where k='org';
-- Cupo chico para probar el límite
update public.plans set ai_monthly_requests = 2 where id = 'profesional';
select set_config('request.jwt.claim.sub', '', false);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false);
do $$ declare q jsonb; r jsonb; r2 jsonb; r3 jsonb; org uuid := (select v from public._t4 where k='org'); begin
  q := public.ai_quota(org);
  if not (q->>'enabled')::boolean or (q->>'limit')::int <> 2 or (q->>'used')::int <> 0 then
    raise exception 'FALLO: cupo inicial incorrecto %', q; end if;
  r := public.ai_reserve_request(org, 'chat');
  if not (r->>'ok')::boolean then raise exception 'FALLO: no reservó %', r; end if;
  if not public.ai_complete_request((r->>'id')::bigint, 'anthropic', 'claude-opus-5-5', 1200, 300) then
    raise exception 'FALLO: no completó la reserva'; end if;
  -- no se puede reescribir una consulta ya completada
  if public.ai_complete_request((r->>'id')::bigint, 'x', 'x', 0, 0) then raise exception 'FALLO: reescribió consumo'; end if;
  -- una consulta fallida se libera y no consume cupo
  r2 := public.ai_reserve_request(org, 'summary');
  if not public.ai_release_request((r2->>'id')::bigint) then raise exception 'FALLO: no liberó'; end if;
  if (public.ai_quota(org)->>'used')::int <> 1 then raise exception 'FALLO: la liberación no devolvió cupo'; end if;
  r2 := public.ai_reserve_request(org, 'summary');
  r3 := public.ai_reserve_request(org, 'summary');
  if (r3->>'ok')::boolean or r3->>'reason' <> 'limit_reached' then raise exception 'FALLO: superó el límite %', r3; end if;
  if (public.ai_reserve_request(org, 'Bad Feature;')->>'reason') <> 'invalid_feature' then raise exception 'FALLO: feature inválida'; end if;
  -- no se puede insertar uso directamente (solo por las funciones)
  begin
    insert into public.ai_usage (organization_id, feature, provider, model) values (org, 'chat', 'x', 'x');
    raise exception 'FALLO: insertó uso de IA directo';
  exception when insufficient_privilege then null; end;
end $$;

-- otra persona no puede completar ni liberar reservas ajenas
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b4', false);
do $$ declare rid bigint; begin
  select id into rid from public.ai_usage where provider = 'pendiente' limit 1;
  if rid is not null and public.ai_release_request(rid) then raise exception 'FALLO: liberó reserva ajena'; end if;
  -- el vendedor no ve el reporte comercial
  begin
    perform public.report_data((select v from public._t4 where k='org'), now() - interval '30 days', now());
    raise exception 'FALLO: vendedor accedió al reporte';
  exception when insufficient_privilege then null; end;
end $$;

-- empresa ajena: sin acceso al cupo ni a reservar
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', false);
do $$ begin
  if (public.ai_reserve_request((select v from public._t4 where k='org'), 'chat')->>'reason') <> 'forbidden' then
    raise exception 'FALLO: reservó en empresa ajena'; end if;
  begin
    perform public.ai_quota((select v from public._t4 where k='org'));
    raise exception 'FALLO: leyó cupo ajeno';
  exception when insufficient_privilege then null; end;
end $$;

-- Reporte con datos reales cargados en la prueba
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false);
insert into public.customers (organization_id, full_name, source) select v, 'Ana Recurrente', 'Instagram' from public._t4 where k='org';
insert into public.customers (organization_id, full_name, source) select v, 'Beto Nuevo', 'Referido' from public._t4 where k='org';
insert into public.leads (organization_id, customer_id, title, estimated_value, assigned_to)
select o.v, c.id, x.t, x.val, '00000000-0000-0000-0000-0000000000b4'
  from public._t4 o, public.customers c,
       (values ('Venta previa', 100000), ('Venta actual', 250000)) x(t, val)
 where o.k='org' and c.full_name = 'Ana Recurrente';
insert into public.leads (organization_id, customer_id, title, estimated_value)
select o.v, c.id, 'Perdida', 80000 from public._t4 o, public.customers c where o.k='org' and c.full_name = 'Beto Nuevo';
update public.leads set status = 'ganado' where title in ('Venta previa', 'Venta actual');
update public.leads set status = 'perdido', lost_reason = 'Precio' where title = 'Perdida';
reset role;
update public.leads set won_at = now() - interval '60 days' where title = 'Venta previa';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false);
set role authenticated;

do $$ declare r jsonb; s jsonb; seller jsonb; begin
  r := public.report_data((select v from public._t4 where k='org'), now() - interval '30 days', now() + interval '1 minute');
  s := r->'summary';
  if (s->>'won_count')::int <> 1 or (s->>'won_value')::numeric <> 250000 then raise exception 'FALLO: ventas ganadas %', s; end if;
  if (s->>'recurring_customers')::int <> 1 then raise exception 'FALLO: recurrentes %', s; end if;
  if (s->>'lost_count')::int <> 1 or (s->>'close_rate')::numeric <> 50.0 then raise exception 'FALLO: perdidas/conversión %', s; end if;
  if (s->>'new_customers')::int <> 2 or (s->>'inquiries')::int <> 3 then raise exception 'FALLO: nuevos/consultas %', s; end if;
  select x into seller from jsonb_array_elements(r->'sellers') x where x->>'user_id' = '00000000-0000-0000-0000-0000000000b4';
  if (seller->>'won_count')::int <> 1 then raise exception 'FALLO: rendimiento por vendedor %', r->'sellers'; end if;
  if (r->'lost_reasons'->0->>'reason') <> 'Precio' then raise exception 'FALLO: motivos de pérdida'; end if;
  begin
    perform public.report_data((select v from public._t4 where k='org'), now(), now() - interval '1 day');
    raise exception 'FALLO: aceptó rango invertido';
  exception when invalid_parameter_value then null; end;
end $$;

reset role;
update public.plans set ai_monthly_requests = 200 where id = 'profesional';
drop table public._t4;
select 'CLIENTE AI y reportes: todas las pruebas pasaron';
