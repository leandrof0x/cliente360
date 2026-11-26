-- Pruebas de la etapa 2: vista de clientes y recordatorios automáticos
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'eva@tres.test'),
  ('00000000-0000-0000-0000-0000000000f1', 'fede@cuatro.test');
create table public._t2 (k text primary key, v uuid);
grant all on public._t2 to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
insert into public._t2 values ('org', public.create_organization('Tienda Tres'));
insert into public.customers (organization_id, full_name, whatsapp) select v, 'Recurrente SA', '0991000111' from public._t2 where k='org';
insert into public._t2 select 'c', id from public.customers where full_name = 'Recurrente SA';

-- dos ventas -> recurrente
insert into public.leads (organization_id, customer_id, title, status, estimated_value)
select (select v from public._t2 where k='org'), (select v from public._t2 where k='c'), 'Venta ' || g, 'ganado', 100000 from generate_series(1,2) g;

do $$ begin
  if not (select is_recurring from public.customer_overview where id = (select v from public._t2 where k='c')) then
    raise exception 'FALLO: cliente con 2 ventas no figura como recurrente'; end if;
  if (select won_value from public.customer_overview where id = (select v from public._t2 where k='c')) <> 200000 then
    raise exception 'FALLO: valor ganado incorrecto'; end if;
end $$;

-- oportunidad con seguimiento -> tarea automática
insert into public.leads (organization_id, customer_id, title, next_action, next_follow_up_at)
select (select v from public._t2 where k='org'), (select v from public._t2 where k='c'), 'Ampliación', 'Llamar', now() + interval '1 day';
insert into public._t2 select 'l', id from public.leads where title = 'Ampliación';

do $$ declare n int; begin
  select count(*) into n from public.tasks where lead_id = (select v from public._t2 where k='l') and source = 'lead_follow_up' and status = 'pendiente';
  if n <> 1 then raise exception 'FALLO: no se creó el recordatorio automático (%).', n; end if;
end $$;

-- reprogramar -> se actualiza la misma tarea (no duplica)
update public.leads set next_follow_up_at = now() + interval '3 days' where id = (select v from public._t2 where k='l');
do $$ declare n int; begin
  select count(*) into n from public.tasks where lead_id = (select v from public._t2 where k='l') and status = 'pendiente';
  if n <> 1 then raise exception 'FALLO: recordatorio duplicado'; end if;
  if (select due_at from public.tasks where lead_id = (select v from public._t2 where k='l') and status='pendiente') < now() + interval '2 days' then
    raise exception 'FALLO: recordatorio no reprogramado'; end if;
end $$;

-- completar la tarea limpia la fecha de la oportunidad
update public.tasks set status = 'completada' where lead_id = (select v from public._t2 where k='l') and status = 'pendiente';
do $$ begin
  if (select next_follow_up_at from public.leads where id = (select v from public._t2 where k='l')) is not null then
    raise exception 'FALLO: no se limpió el próximo seguimiento'; end if;
end $$;

-- nuevo seguimiento y luego se pierde -> se cancela
update public.leads set next_follow_up_at = now() + interval '1 day' where id = (select v from public._t2 where k='l');
update public.leads set status = 'perdido' where id = (select v from public._t2 where k='l');
do $$ begin
  if exists (select 1 from public.tasks where lead_id = (select v from public._t2 where k='l') and status = 'pendiente') then
    raise exception 'FALLO: recordatorio no cancelado al perder'; end if;
end $$;

-- aislamiento de la vista
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
select public.create_organization('Otra Cuatro');
do $$ begin
  if exists (select 1 from public.customer_overview) then raise exception 'FALLO: la vista expone clientes de otra empresa'; end if;
end $$;

reset role;
drop table public._t2;
select 'CRM: todas las pruebas pasaron' as resultado;
