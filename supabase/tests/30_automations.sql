-- Pruebas de la etapa 3: automatizaciones, cola y canales
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a3', 'gabi@cinco.test'),
  ('00000000-0000-0000-0000-0000000000b3', 'hugo@seis.test');
create table public._t3 (k text primary key, v uuid);
grant all on public._t3 to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', false);
insert into public._t3 values ('org', public.create_organization('Cinco SRL'));
insert into public.customers (organization_id, full_name, whatsapp) select v, 'Cliente Auto', '0971 222 333' from public._t3 where k='org';
insert into public._t3 select 'c', id from public.customers where full_name = 'Cliente Auto';

insert into public.automations (organization_id, name, trigger_type, action_type, action_config, is_active)
select v, 'Contactar nuevas consultas', 'lead_created', 'create_task', '{"title":"Contactar a {cliente}","due_in_hours":2,"priority":"alta"}', true from public._t3 where k='org';
insert into public.automations (organization_id, name, trigger_type, trigger_config, action_type, action_config, is_active)
select v, 'Avisar a n8n al ganar', 'lead_status_changed', '{"status":"ganado"}', 'webhook_n8n', '{"url":"https://n8n.example.com/webhook/x"}', true from public._t3 where k='org';
insert into public.automations (organization_id, name, trigger_type, action_type, is_active)
select v, 'Inactiva', 'lead_created', 'create_task', false from public._t3 where k='org';

insert into public.leads (organization_id, customer_id, title)
select (select v from public._t3 where k='org'), (select v from public._t3 where k='c'), 'Consulta automática';
insert into public._t3 select 'l', id from public.leads where title = 'Consulta automática';

do $$ declare n int; t public.tasks; begin
  select count(*) into n from public.tasks where lead_id = (select v from public._t3 where k='l') and source = 'automation';
  if n <> 1 then raise exception 'FALLO: la automatización creó % tareas (esperado 1)', n; end if;
  select * into t from public.tasks where lead_id = (select v from public._t3 where k='l') and source = 'automation';
  if t.title <> 'Contactar a Cliente Auto' or t.priority <> 'alta' then raise exception 'FALLO: tarea mal armada: %', t.title; end if;
  if t.due_at < now() + interval '110 minutes' or t.due_at > now() + interval '130 minutes' then raise exception 'FALLO: vencimiento incorrecto'; end if;
end $$;

-- estado a ganado -> evento en cola para n8n (no se envía desde la base)
update public.leads set status = 'contactado' where id = (select v from public._t3 where k='l');
do $$ begin
  if exists (select 1 from public.automation_outbox) then raise exception 'FALLO: encoló sin corresponder'; end if;
end $$;
update public.leads set status = 'ganado' where id = (select v from public._t3 where k='l');
do $$ begin
  if (select count(*) from public.automation_outbox where action_type = 'webhook_n8n' and status = 'pending') <> 1 then
    raise exception 'FALLO: evento para n8n no encolado'; end if;
end $$;

-- WhatsApp: no se puede activar sin canal conectado y autorizado
do $$ begin
  insert into public.automations (organization_id, name, trigger_type, action_type, is_active)
  select v, 'Responder por WhatsApp', 'lead_created', 'send_whatsapp', true from public._t3 where k='org';
  raise exception 'FALLO: activó envío de WhatsApp sin canal';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
end $$;

-- El navegador no puede marcar el canal como conectado
do $$ begin
  insert into public.channel_connections (organization_id, channel, provider, status)
  select v, 'whatsapp', 'whatsapp_cloud_api', 'conectado' from public._t3 where k='org';
  raise exception 'FALLO: canal marcado como conectado desde el cliente';
exception when insufficient_privilege then null; end $$;

-- Webhook sin https
do $$ begin
  insert into public.automations (organization_id, name, trigger_type, action_type, action_config)
  select v, 'Mala URL', 'lead_created', 'webhook_n8n', '{"url":"http://x"}' from public._t3 where k='org';
  raise exception 'FALLO: aceptó webhook sin https';
exception when invalid_parameter_value then null; end $$;

-- Programadas: cliente sin contacto con oportunidad abierta
insert into public.leads (organization_id, customer_id, title) select (select v from public._t3 where k='org'), (select v from public._t3 where k='c'), 'Abierta';
reset role;
update public.customers set created_at = now() - interval '10 days', last_contact_at = null where id = (select v from public._t3 where k='c');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', false);
insert into public.automations (organization_id, name, trigger_type, trigger_config, action_type, action_config, is_active)
select v, 'Sin contacto 7 días', 'no_contact_days', '{"days":7}', 'create_task', '{"title":"Retomar contacto con {cliente}"}', true from public._t3 where k='org';
do $$ declare n int; begin
  n := public.run_scheduled_automations((select v from public._t3 where k='org'));
  if n <> 1 then raise exception 'FALLO: programada ejecutó % (esperado 1)', n; end if;
  n := public.run_scheduled_automations((select v from public._t3 where k='org'));
  if n <> 0 then raise exception 'FALLO: programada duplicó tareas'; end if;
end $$;

-- Otro usuario no puede ejecutar automatizaciones ajenas ni ver la cola
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', false);
insert into public._t3 values ('org2', public.create_organization('Seis SA'));
do $$ begin
  perform public.run_scheduled_automations((select v from public._t3 where k='org'));
  raise exception 'FALLO: ejecutó automatizaciones de otra empresa';
exception when insufficient_privilege then null; end $$;
do $$ begin
  if exists (select 1 from public.automation_outbox) or exists (select 1 from public.automation_runs) then
    raise exception 'FALLO: ve la cola/ejecuciones de otra empresa'; end if;
end $$;

-- Plan Inicial: sin automatizaciones
reset role;
update public.subscriptions set plan_id = 'inicial' where organization_id = (select v from public._t3 where k='org2');
set role authenticated;
do $$ begin
  insert into public.automations (organization_id, name, trigger_type, action_type)
  select v, 'x', 'lead_created', 'create_task' from public._t3 where k='org2';
  raise exception 'FALLO: plan Inicial creó automatización';
exception when insufficient_privilege then null; end $$;

reset role;
drop table public._t3;
select 'Automatizaciones: todas las pruebas pasaron' as resultado;
