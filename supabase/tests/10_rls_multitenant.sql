-- =====================================================================
-- Pruebas de aislamiento multiempresa, roles, integridad y límites.
-- Se ejecutan con scripts/db-test.sh sobre un PostgreSQL local.
-- Cada bloque falla (RAISE) si una regla de seguridad no se cumple.
-- =====================================================================
\set ON_ERROR_STOP 1

-- Usuarios de prueba
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@uno.test',   '{"full_name":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', 'beto@dos.test',  '{"full_name":"Beto"}'),
  ('00000000-0000-0000-0000-00000000000c', 'caro@uno.test',  '{"full_name":"Caro"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dani@uno.test',  '{"full_name":"Dani"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@c360.test','{"full_name":"Admin"}');
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000ad');

do $$ begin
  if (select count(*) from public.profiles) <> 5 then raise exception 'FALLO: perfiles no creados por trigger'; end if;
end $$;

create table public._t (k text primary key, v uuid);
grant all on public._t to authenticated;

-- ---------------------------------------------------------------- Ana crea Org Uno
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public._t values ('org1', public.create_organization('Ferretería Uno'));

do $$
declare org uuid := (select v from public._t where k = 'org1');
begin
  if public.org_role_of(org) <> 'owner' then raise exception 'FALLO: Ana debería ser propietaria'; end if;
  if not public.org_is_writable(org) then raise exception 'FALLO: prueba gratis debería permitir escribir'; end if;
  if (select plan_id from public.subscriptions where organization_id = org) <> 'profesional' then
    raise exception 'FALLO: plan de prueba incorrecto'; end if;
end $$;

insert into public.customers (organization_id, full_name, phone, email)
select v, 'Cliente Uno', '0981 123 456', 'cliente@uno.test' from public._t where k = 'org1';

-- Duplicado por teléfono en otro formato
do $$ begin
  insert into public.customers (organization_id, full_name, whatsapp)
  select v, 'Duplicado', '+595 981 123456' from public._t where k = 'org1';
  raise exception 'FALLO: permitió teléfono duplicado';
exception when unique_violation then null; end $$;

-- Duplicado por email (mayúsculas)
do $$ begin
  insert into public.customers (organization_id, full_name, email)
  select v, 'Duplicado', 'CLIENTE@uno.test' from public._t where k = 'org1';
  raise exception 'FALLO: permitió email duplicado';
exception when unique_violation then null; end $$;

-- created_by no se puede falsificar
do $$ begin
  if (select created_by from public.customers where full_name = 'Cliente Uno') <> auth.uid() then
    raise exception 'FALLO: created_by no es el usuario actual'; end if;
end $$;

insert into public._t
select 'cust1', id from public.customers where full_name = 'Cliente Uno';

insert into public.leads (organization_id, customer_id, title, estimated_value)
select (select v from public._t where k='org1'), (select v from public._t where k='cust1'), 'Cotización techo', 1500000;
insert into public._t select 'lead1', id from public.leads where title = 'Cotización techo';

update public.leads set status = 'contactado' where id = (select v from public._t where k='lead1');
update public.leads set status = 'negociacion' where id = (select v from public._t where k='lead1');
update public.leads set status = 'ganado' where id = (select v from public._t where k='lead1');

do $$ declare l public.leads; begin
  select * into l from public.leads where id = (select v from public._t where k='lead1');
  if l.won_at is null then raise exception 'FALLO: won_at no se registró'; end if;
  if (select count(*) from public.lead_status_changes where lead_id = l.id) <> 4 then
    raise exception 'FALLO: historial de estados incompleto'; end if;
  if (select count(*) from public.activity_logs where entity_id = l.id and action = 'status_changed') <> 3 then
    raise exception 'FALLO: actividad de cambios de estado no registrada'; end if;
end $$;

insert into public.interactions (organization_id, customer_id, type, direction, content)
select (select v from public._t where k='org1'), (select v from public._t where k='cust1'), 'whatsapp', 'saliente', 'Le envié la cotización';
do $$ begin
  if (select last_contact_at from public.customers where id = (select v from public._t where k='cust1')) is null then
    raise exception 'FALLO: last_contact_at no se actualizó'; end if;
end $$;

insert into public.tasks (organization_id, customer_id, title, due_at)
select (select v from public._t where k='org1'), (select v from public._t where k='cust1'), 'Llamar mañana', now() - interval '1 hour';

-- Dashboard con datos reales
do $$ declare d jsonb; begin
  d := public.dashboard_data((select v from public._t where k='org1'), now() - interval '30 days', now() + interval '1 day');
  if (d #>> '{kpis,total_customers}')::int <> 1 then raise exception 'FALLO dashboard total_customers: %', d -> 'kpis'; end if;
  if (d #>> '{kpis,won_count}')::int <> 1 then raise exception 'FALLO dashboard won_count'; end if;
  if (d #>> '{kpis,won_value}')::numeric <> 1500000 then raise exception 'FALLO dashboard won_value'; end if;
  if (d #>> '{kpis,conversion_rate}')::numeric <> 100 then raise exception 'FALLO dashboard conversion'; end if;
  if (d #>> '{kpis,overdue_tasks}')::int <> 1 then raise exception 'FALLO dashboard overdue_tasks'; end if;
  if jsonb_array_length(d -> 'series') < 30 then raise exception 'FALLO dashboard series'; end if;
  if (d -> 'funnel' -> 4 ->> 'count')::int <> 1 then raise exception 'FALLO funnel negociación: %', d -> 'funnel'; end if;
end $$;

-- ---------------------------------------------------------------- Beto crea Org Dos
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
insert into public._t values ('org2', public.create_organization('Peluquería Dos'));

do $$
declare org1 uuid := (select v from public._t where k = 'org1');
        n int;
begin
  -- No ve nada de Org Uno
  if exists (select 1 from public.organizations where id = org1) then raise exception 'FALLO: Beto ve Org Uno'; end if;
  if exists (select 1 from public.customers) then raise exception 'FALLO: Beto ve clientes ajenos'; end if;
  if exists (select 1 from public.leads) then raise exception 'FALLO: Beto ve oportunidades ajenas'; end if;
  if exists (select 1 from public.tasks) then raise exception 'FALLO: Beto ve tareas ajenas'; end if;
  if exists (select 1 from public.interactions) then raise exception 'FALLO: Beto ve interacciones ajenas'; end if;
  if exists (select 1 from public.activity_logs where organization_id = org1) then raise exception 'FALLO: Beto ve actividad ajena'; end if;
  if exists (select 1 from public.lead_status_changes) then raise exception 'FALLO: Beto ve historial ajeno'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'FALLO: Beto ve perfiles ajenos'; end if;

  -- No puede modificar ni borrar
  update public.customers set full_name = 'Hackeado' where organization_id = org1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: Beto modificó clientes ajenos'; end if;
  delete from public.customers where organization_id = org1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: Beto borró clientes ajenos'; end if;

  -- No puede insertar en Org Uno
  begin
    insert into public.customers (organization_id, full_name) values (org1, 'Intruso');
    raise exception 'FALLO: Beto insertó en Org Uno';
  exception when insufficient_privilege then null; end;

  -- No puede usar el dashboard de Org Uno
  begin
    perform public.dashboard_data(org1, now() - interval '30 days', now());
    raise exception 'FALLO: Beto leyó el dashboard de Org Uno';
  exception when insufficient_privilege then null; end;
end $$;

-- Referencias cruzadas: oportunidad en Org Dos apuntando a cliente de Org Uno
do $$ begin
  insert into public.leads (organization_id, customer_id, title)
  values ((select v from public._t where k='org2'), (select v from public._t where k='cust1'), 'Robo');
  raise exception 'FALLO: permitió referencia a cliente de otra empresa';
exception when foreign_key_violation then null; end $$;

-- Mover un cliente propio a otra empresa
insert into public.customers (organization_id, full_name) select v, 'Cliente Dos' from public._t where k='org2';
do $$ begin
  update public.customers set organization_id = (select v from public._t where k='org1') where full_name = 'Cliente Dos';
  raise exception 'FALLO: permitió mover un cliente a otra empresa';
exception when insufficient_privilege then null; end $$;

-- No puede autoasignarse como miembro de Org Uno
do $$ begin
  insert into public.organization_members (organization_id, user_id, role)
  values ((select v from public._t where k='org1'), auth.uid(), 'owner');
  raise exception 'FALLO: Beto se agregó a Org Uno';
exception when insufficient_privilege then null; end $$;

-- No puede cambiar su propia suscripción
do $$ declare n int; begin
  update public.subscriptions set status = 'active', current_period_end = now() + interval '10 years';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: Beto modificó su suscripción'; end if;
end $$;

-- No puede suspender/activar su propia cuenta
do $$ begin
  update public.organizations set status = 'active', suspended_reason = 'x' where id = (select v from public._t where k='org2');
  raise exception 'FALLO: Beto cambió el estado de su cuenta';
exception when insufficient_privilege then null; end $$;

-- Secretos de canales: inaccesibles
do $$ begin
  if exists (select 1 from public.channel_secrets) then raise exception 'FALLO: secretos visibles'; end if;
end $$;

-- No puede ser plataforma admin
do $$ begin
  if public.is_platform_admin() then raise exception 'FALLO: Beto es admin'; end if;
  insert into public.platform_admins values (auth.uid());
  raise exception 'FALLO: Beto se hizo admin';
exception when insufficient_privilege then null; end $$;

-- No puede quedar la empresa sin propietario
do $$ begin
  delete from public.organization_members where user_id = auth.uid();
  raise exception 'FALLO: se eliminó al único propietario';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
end $$;

-- ---------------------------------------------------------------- Roles dentro de Org Uno
reset role;
insert into public.organization_members (organization_id, user_id, role)
select v, '00000000-0000-0000-0000-00000000000c', 'seller' from public._t where k='org1';
insert into public.organization_members (organization_id, user_id, role)
select v, '00000000-0000-0000-0000-00000000000d', 'collaborator' from public._t where k='org1';

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ declare n int; begin
  -- vendedor: ve los datos, no borra clientes
  if (select count(*) from public.customers) <> 1 then raise exception 'FALLO: vendedor no ve clientes'; end if;
  delete from public.customers;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: vendedor borró clientes'; end if;
  -- vendedor no se puede ascender a propietario
  begin
    update public.organization_members set role = 'owner' where user_id = auth.uid();
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FALLO: vendedor cambió su rol'; end if;
  end;
  -- vendedor no ve pagos
  if exists (select 1 from public.payments) then raise exception 'FALLO: vendedor ve pagos'; end if;
  -- vendedor no crea automatizaciones
  begin
    insert into public.automations (organization_id, name, trigger_type, action_type)
    select v, 'x', 'lead_created', 'create_task' from public._t where k='org1';
    raise exception 'FALLO: vendedor creó automatización';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$ begin
  -- colaborador: no crea plantillas
  insert into public.message_templates (organization_id, name, body)
  select v, 'Bienvenida', 'Hola' from public._t where k='org1';
  raise exception 'FALLO: colaborador creó plantilla';
exception when insufficient_privilege then null; end $$;

-- Asignar responsable que no es miembro
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  update public.leads set assigned_to = '00000000-0000-0000-0000-00000000000b' where id = (select v from public._t where k='lead1');
  raise exception 'FALLO: asignó responsable externo';
exception when foreign_key_violation then null; end $$;

-- ---------------------------------------------------------------- Admin de plataforma
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
do $$ begin
  if not public.is_platform_admin() then raise exception 'FALLO: admin no reconocido'; end if;
  if (select count(*) from public.organizations) <> 2 then raise exception 'FALLO: admin no ve empresas'; end if;
  if exists (select 1 from public.customers) then raise exception 'FALLO: admin ve clientes de empresas'; end if;
end $$;
update public.organizations set status = 'suspended', suspended_reason = 'prueba'
 where id = (select v from public._t where k='org2');

-- ---------------------------------------------------------------- Bloqueo por estado
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.customers) <> 1 then raise exception 'FALLO: suspendida debería poder leer'; end if;
  insert into public.customers (organization_id, full_name) select v, 'Nuevo' from public._t where k='org2';
  raise exception 'FALLO: empresa suspendida pudo escribir';
exception when insufficient_privilege then null; end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);  -- operación de sistema (service_role)
update public.organizations set status = 'active' where id = (select v from public._t where k='org2');
update public.subscriptions set trial_ends_at = now() - interval '1 day' where organization_id = (select v from public._t where k='org2');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  insert into public.customers (organization_id, full_name) select v, 'Nuevo' from public._t where k='org2';
  raise exception 'FALLO: prueba vencida pudo escribir';
exception when insufficient_privilege then null; end $$;

-- ---------------------------------------------------------------- Límites de plan
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.subscriptions set plan_id = 'inicial', status = 'active', current_period_end = now() + interval '30 days'
 where organization_id = (select v from public._t where k='org2');
-- Inicial: 1 usuario
do $$ begin
  insert into public.organization_members (organization_id, user_id, role)
  select v, '00000000-0000-0000-0000-00000000000d', 'seller' from public._t where k='org2';
  raise exception 'FALLO: superó el límite de usuarios';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
-- Inicial: 100 clientes (ya tiene 1)
insert into public.customers (organization_id, full_name)
select (select v from public._t where k='org2'), 'Cliente ' || g from generate_series(1, 99) g;
do $$ begin
  insert into public.customers (organization_id, full_name) select v, 'Cliente 101' from public._t where k='org2';
  raise exception 'FALLO: superó el límite de clientes';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
end $$;

reset role;
drop table public._t;
select 'RLS multiempresa: todas las pruebas pasaron' as resultado;
