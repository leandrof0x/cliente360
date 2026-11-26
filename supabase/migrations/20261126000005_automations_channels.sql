-- =====================================================================
-- CLIENTE360 · Etapa 3: automatizaciones, cola de eventos para n8n y
-- canales de mensajería.
--
-- Reglas:
--  * Las automatizaciones internas (crear tareas) corren dentro de la base.
--  * Los envíos externos (webhook n8n, WhatsApp) pasan por una cola
--    (automation_outbox) que procesa el servidor con service_role.
--  * Nunca se envía un mensaje a un cliente si el canal no está conectado
--    Y autorizado explícitamente por un propietario/administrador.
-- =====================================================================

-- Automatizaciones solo en planes que las incluyen
drop policy if exists automations_write on public.automations;
create policy automations_write on public.automations for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
              and public.org_is_writable(organization_id)
              and public.org_has_feature(organization_id, 'automations'));

alter table public.automations
  add constraint automations_trigger_chk check (trigger_type in ('lead_created', 'lead_status_changed', 'no_contact_days')),
  add constraint automations_action_chk check (action_type in ('create_task', 'webhook_n8n', 'send_whatsapp'));

-- Un envío de WhatsApp exige canal conectado y autorizado
create or replace function public.channel_is_authorized(org uuid, ch public.channel_type)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channel_connections
    where organization_id = org and channel = ch and status = 'conectado' and authorized_at is not null
  )
$$;
revoke all on function public.channel_is_authorized(uuid, public.channel_type) from public, anon;
grant execute on function public.channel_is_authorized(uuid, public.channel_type) to authenticated;

create or replace function public.automations_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.action_type = 'send_whatsapp' then
    new.requires_channel := 'whatsapp';
    if new.is_active and not public.channel_is_authorized(new.organization_id, 'whatsapp') then
      raise exception 'Para activar envíos por WhatsApp primero conectá y autorizá el canal en Configuración'
        using errcode = 'P0001';
    end if;
  end if;
  if new.action_type = 'webhook_n8n' then
    if coalesce(new.action_config ->> 'url', '') !~ '^https://' then
      raise exception 'La URL del webhook debe empezar con https://' using errcode = '22023';
    end if;
  end if;
  if new.trigger_type = 'no_contact_days' then
    if coalesce((new.trigger_config ->> 'days')::int, 0) not between 1 and 365 then
      raise exception 'Indicá entre 1 y 365 días sin contacto' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

create trigger automations_validate before insert or update on public.automations
  for each row execute function public.automations_validate();

-- Cola de eventos para entregas externas
create table public.automation_outbox (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  action_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'error', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index automation_outbox_pending_idx on public.automation_outbox(status, created_at) where status = 'pending';
alter table public.automation_outbox enable row level security;
create policy outbox_read on public.automation_outbox for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

-- ---------------------------------------------------------------------
-- Motor: ejecuta una automatización para un contexto (oportunidad/cliente)
-- ---------------------------------------------------------------------
create or replace function public.automation_execute(a public.automations, ctx jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  hours numeric := coalesce((a.action_config ->> 'due_in_hours')::numeric, 24);
  ttitle text := coalesce(nullif(trim(a.action_config ->> 'title'), ''), a.name);
  cname text := ctx ->> 'customer_name';
  v_customer uuid := (ctx ->> 'customer_id')::uuid;
  v_lead uuid := nullif(ctx ->> 'lead_id', '')::uuid;
  v_assignee uuid := nullif(ctx ->> 'assigned_to', '')::uuid;
begin
  if not public.org_is_writable(a.organization_id) or not public.org_has_feature(a.organization_id, 'automations') then
    insert into public.automation_runs (organization_id, automation_id, status, detail, context)
    values (a.organization_id, a.id, 'skipped', 'Cuenta en solo lectura o plan sin automatizaciones', ctx);
    return;
  end if;

  if a.action_type = 'create_task' then
    ttitle := replace(replace(ttitle, '{cliente}', coalesce(cname, '')), '{oportunidad}', coalesce(ctx ->> 'lead_title', ''));
    insert into public.tasks (organization_id, title, type, priority, due_at, customer_id, lead_id, assigned_to, source, automation_id)
    values (a.organization_id, left(ttitle, 200),
            coalesce((a.action_config ->> 'task_type')::public.task_type, 'seguimiento'),
            coalesce((a.action_config ->> 'priority')::public.task_priority, 'media'),
            now() + make_interval(mins => (hours * 60)::int),
            v_customer, v_lead, v_assignee, 'automation', a.id);
    insert into public.automation_runs (organization_id, automation_id, status, detail, context)
    values (a.organization_id, a.id, 'ok', 'Tarea creada: ' || left(ttitle, 120), ctx);
  elsif a.action_type = 'send_whatsapp' and not public.channel_is_authorized(a.organization_id, 'whatsapp') then
    insert into public.automation_runs (organization_id, automation_id, status, detail, context)
    values (a.organization_id, a.id, 'skipped', 'Canal de WhatsApp no conectado o no autorizado: no se envió nada', ctx);
  else
    -- webhook_n8n / send_whatsapp: se encola para que el servidor lo entregue
    insert into public.automation_outbox (organization_id, automation_id, action_type, payload)
    values (a.organization_id, a.id, a.action_type,
            jsonb_build_object('event', a.trigger_type, 'automation', a.name, 'organization_id', a.organization_id,
                               'data', ctx, 'config', a.action_config, 'created_at', now()));
    insert into public.automation_runs (organization_id, automation_id, status, detail, context)
    values (a.organization_id, a.id, 'ok', 'Evento encolado para envío', ctx);
  end if;

  update public.automations set last_run_at = now(), run_count = run_count + 1 where id = a.id;
exception when others then
  insert into public.automation_runs (organization_id, automation_id, status, detail, context)
  values (a.organization_id, a.id, 'error', left(sqlerrm, 300), ctx);
end $$;

revoke all on function public.automation_execute(public.automations, jsonb) from public, anon, authenticated;

-- Disparadores sobre oportunidades
create or replace function public.leads_run_automations()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a public.automations;
  ctx jsonb;
begin
  -- evitar recursión si una automatización modifica oportunidades
  if pg_trigger_depth() > 2 then return null; end if;

  select jsonb_build_object(
    'lead_id', new.id, 'lead_title', new.title, 'status', new.status, 'estimated_value', new.estimated_value,
    'customer_id', new.customer_id, 'customer_name', c.full_name, 'customer_phone', coalesce(c.whatsapp, c.phone),
    'customer_email', c.email, 'assigned_to', new.assigned_to,
    'previous_status', case when tg_op = 'UPDATE' then old.status::text end)
  into ctx
  from public.customers c where c.id = new.customer_id;

  for a in
    select * from public.automations
    where organization_id = new.organization_id and is_active
      and (
        (tg_op = 'INSERT' and trigger_type = 'lead_created')
        or (tg_op = 'UPDATE' and new.status is distinct from old.status and trigger_type = 'lead_status_changed'
            and coalesce(trigger_config ->> 'status', new.status::text) = new.status::text)
      )
  loop
    perform public.automation_execute(a, ctx);
  end loop;
  return null;
end $$;

create trigger leads_run_automations after insert or update of status on public.leads
  for each row execute function public.leads_run_automations();

-- Automatizaciones programadas: clientes sin contacto.
-- Crea como máximo una tarea pendiente por cliente y automatización.
create or replace function public.run_scheduled_automations(p_org uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  a public.automations;
  c record;
  n integer := 0;
begin
  -- Usuarios: solo su empresa y siendo propietario/administrador. Sistema (cron): todas.
  if auth.uid() is not null then
    if p_org is null or not public.has_org_role(p_org, array['owner','admin']::public.org_role[]) then
      raise exception 'Sin permiso' using errcode = '42501';
    end if;
  end if;

  for a in
    select * from public.automations
    where is_active and trigger_type = 'no_contact_days' and (p_org is null or organization_id = p_org)
  loop
    for c in
      select cu.id, cu.full_name, coalesce(cu.whatsapp, cu.phone) phone, cu.email, cu.assigned_to
      from public.customers cu
      where cu.organization_id = a.organization_id
        and cu.status <> 'inactivo'
        and coalesce(cu.last_contact_at, cu.created_at) < now() - make_interval(days => (a.trigger_config ->> 'days')::int)
        and (coalesce((a.trigger_config ->> 'only_open_leads')::boolean, true) = false
             or exists (select 1 from public.leads l where l.customer_id = cu.id and l.status not in ('ganado','perdido')))
        and not exists (select 1 from public.tasks t where t.customer_id = cu.id and t.automation_id = a.id and t.status = 'pendiente')
        and not exists (select 1 from public.automation_runs r where r.automation_id = a.id
                        and r.context ->> 'customer_id' = cu.id::text and r.created_at > now() - interval '20 hours')
      limit 200
    loop
      perform public.automation_execute(a, jsonb_build_object(
        'customer_id', c.id, 'customer_name', c.full_name, 'customer_phone', c.phone,
        'customer_email', c.email, 'assigned_to', c.assigned_to));
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

revoke all on function public.run_scheduled_automations(uuid) from public, anon;
grant execute on function public.run_scheduled_automations(uuid) to authenticated;

-- tasks.automation_id ahora referencia automations
alter table public.tasks
  add constraint tasks_automation_fk foreign key (automation_id) references public.automations(id) on delete set null;

-- ---------------------------------------------------------------------
-- Canales: protección de campos sensibles
-- ---------------------------------------------------------------------
create or replace function public.channel_connections_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- desde el navegador no se puede marcar un canal como "conectado": lo hace el servidor tras verificarlo
  if auth.uid() is not null and new.status = 'conectado'
     and (tg_op = 'INSERT' or old.status <> 'conectado') then
    raise exception 'El canal se marca como conectado solo después de verificarlo' using errcode = '42501';
  end if;
  if new.authorized_at is not null and (tg_op = 'INSERT' or old.authorized_at is null) then
    new.authorized_by := coalesce(auth.uid(), new.authorized_by);
  end if;
  return new;
end $$;

create trigger channel_connections_guard before insert or update on public.channel_connections
  for each row execute function public.channel_connections_guard();

-- Plantillas: variables soportadas documentadas en la app ({nombre}, {primer_nombre}, ...)
create index if not exists message_templates_org_idx on public.message_templates(organization_id, name);
