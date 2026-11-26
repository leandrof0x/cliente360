-- =====================================================================
-- CLIENTE360 · Seguridad: funciones auxiliares, triggers de integridad,
-- límites por plan y políticas RLS.
--
-- Principios:
--  * Ningún negocio puede leer ni escribir datos de otro (RLS por organization_id).
--  * Las referencias entre tablas se validan dentro de la misma organización.
--  * Empresas suspendidas o con suscripción vencida quedan en solo lectura.
--  * El administrador de la plataforma NO lee datos de clientes de las empresas;
--    usa funciones agregadas (migración 0003).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones auxiliares (SECURITY DEFINER para evitar recursión de RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;

create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org and user_id = (select auth.uid())
  )
$$;

create or replace function public.org_role_of(org uuid)
returns public.org_role language sql stable security definer set search_path = '' as $$
  select role from public.organization_members
  where organization_id = org and user_id = (select auth.uid())
$$;

create or replace function public.has_org_role(org uuid, roles public.org_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.org_role_of(org) = any(roles), false)
$$;

-- ¿La empresa puede modificar datos? (cuenta activa + suscripción vigente)
create or replace function public.org_is_writable(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organizations o
    join public.subscriptions s on s.organization_id = o.id
    where o.id = org
      and o.status = 'active'
      and (
        (s.status = 'trialing' and s.trial_ends_at > now())
        or (s.status = 'active' and (s.current_period_end is null or s.current_period_end > now() - interval '3 days'))
        or (s.status = 'past_due' and (s.current_period_end is null or s.current_period_end > now() - interval '7 days'))
      )
  )
$$;

-- Plan efectivo de una empresa
create or replace function public.org_plan(org uuid)
returns public.plans language sql stable security definer set search_path = '' as $$
  select p.* from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.organization_id = org
$$;

create or replace function public.org_has_feature(org uuid, feature text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select (p.features ->> feature) is not null and (p.features ->> feature) <> 'false'
     from public.subscriptions s join public.plans p on p.id = s.plan_id
     where s.organization_id = org),
    false)
$$;

-- ---------------------------------------------------------------------
-- Alta de usuario -> perfil
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Integridad multiempresa: las referencias deben ser de la misma empresa
-- ---------------------------------------------------------------------
create or replace function public.enforce_same_org_refs()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  j jsonb := to_jsonb(new);
begin
  if j ? 'customer_id' and (j ->> 'customer_id') is not null then
    if not exists (select 1 from public.customers
                   where id = (j ->> 'customer_id')::uuid and organization_id = new.organization_id) then
      raise exception 'El cliente no pertenece a esta empresa' using errcode = '23503';
    end if;
  end if;
  if j ? 'lead_id' and (j ->> 'lead_id') is not null then
    if not exists (select 1 from public.leads
                   where id = (j ->> 'lead_id')::uuid and organization_id = new.organization_id) then
      raise exception 'La oportunidad no pertenece a esta empresa' using errcode = '23503';
    end if;
  end if;
  if j ? 'assigned_to' and (j ->> 'assigned_to') is not null then
    if not exists (select 1 from public.organization_members
                   where user_id = (j ->> 'assigned_to')::uuid and organization_id = new.organization_id) then
      raise exception 'El responsable no es miembro de esta empresa' using errcode = '23503';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'No se puede mover un registro a otra empresa' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger customers_same_org before insert or update on public.customers
  for each row execute function public.enforce_same_org_refs();
create trigger leads_same_org before insert or update on public.leads
  for each row execute function public.enforce_same_org_refs();
create trigger interactions_same_org before insert or update on public.interactions
  for each row execute function public.enforce_same_org_refs();
create trigger tasks_same_org before insert or update on public.tasks
  for each row execute function public.enforce_same_org_refs();
create trigger appointments_same_org before insert or update on public.appointments
  for each row execute function public.enforce_same_org_refs();

-- Autoría: created_by siempre es el usuario autenticado (no se puede falsificar)
create or replace function public.set_created_by()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

create trigger customers_created_by before insert on public.customers
  for each row execute function public.set_created_by();
create trigger leads_created_by before insert on public.leads
  for each row execute function public.set_created_by();
create trigger interactions_created_by before insert on public.interactions
  for each row execute function public.set_created_by();
create trigger tasks_created_by before insert on public.tasks
  for each row execute function public.set_created_by();
create trigger appointments_created_by before insert on public.appointments
  for each row execute function public.set_created_by();
create trigger templates_created_by before insert on public.message_templates
  for each row execute function public.set_created_by();
create trigger automations_created_by before insert on public.automations
  for each row execute function public.set_created_by();

-- ---------------------------------------------------------------------
-- Oportunidades: fechas de cierre e historial de estados
-- ---------------------------------------------------------------------
create or replace function public.leads_before_write()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'ganado' then
      new.won_at := coalesce(new.won_at, now()); new.lost_at := null;
    elsif new.status = 'perdido' then
      new.lost_at := coalesce(new.lost_at, now()); new.won_at := null;
    else
      new.won_at := null; new.lost_at := null; new.lost_reason := null;
    end if;
  end if;
  return new;
end $$;

create trigger leads_before_write before insert or update on public.leads
  for each row execute function public.leads_before_write();

create or replace function public.leads_track_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_status_changes (organization_id, lead_id, from_status, to_status, changed_by)
    values (new.organization_id, new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.lead_status_changes (organization_id, lead_id, from_status, to_status, changed_by)
    values (new.organization_id, new.id, old.status, new.status, auth.uid());
  end if;
  return null;
end $$;

create trigger leads_track_status after insert or update of status on public.leads
  for each row execute function public.leads_track_status();

-- Interacciones: actualizar el último contacto del cliente
create or replace function public.interactions_touch_customer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type <> 'nota' and new.direction <> 'interna' then
    update public.customers
       set last_contact_at = greatest(coalesce(last_contact_at, new.occurred_at), new.occurred_at)
     where id = new.customer_id;
  end if;
  return null;
end $$;

create trigger interactions_touch_customer after insert on public.interactions
  for each row execute function public.interactions_touch_customer();

-- Tareas: fecha de completado
create or replace function public.tasks_before_write()
returns trigger language plpgsql as $$
begin
  if new.status = 'completada' and (tg_op = 'INSERT' or old.status <> 'completada') then
    new.completed_at := now(); new.completed_by := auth.uid();
  elsif new.status <> 'completada' then
    new.completed_at := null; new.completed_by := null;
  end if;
  return new;
end $$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- ---------------------------------------------------------------------
-- Límites por plan (se aplican en la base, no solo en la interfaz)
-- ---------------------------------------------------------------------
create or replace function public.enforce_customer_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lim integer;
  cnt integer;
begin
  select p.max_customers into lim
    from public.subscriptions s join public.plans p on p.id = s.plan_id
   where s.organization_id = new.organization_id;
  if lim is not null then
    select count(*) into cnt from public.customers where organization_id = new.organization_id;
    if cnt >= lim then
      raise exception 'Tu plan permite hasta % clientes. Mejorá tu plan para registrar más.', lim
        using errcode = 'P0001', hint = 'plan_limit_customers';
    end if;
  end if;
  return new;
end $$;

create trigger customers_plan_limit before insert on public.customers
  for each row execute function public.enforce_customer_limit();

create or replace function public.enforce_member_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lim integer;
  cnt integer;
begin
  select p.max_users into lim
    from public.subscriptions s join public.plans p on p.id = s.plan_id
   where s.organization_id = new.organization_id;
  if lim is not null then
    select count(*) into cnt from public.organization_members where organization_id = new.organization_id;
    if cnt >= lim then
      raise exception 'Tu plan permite hasta % usuarios.', lim
        using errcode = 'P0001', hint = 'plan_limit_users';
    end if;
  end if;
  return new;
end $$;

create trigger members_plan_limit before insert on public.organization_members
  for each row execute function public.enforce_member_limit();

-- Siempre debe quedar al menos un propietario; solo un propietario asigna/quita propietarios
create or replace function public.protect_owners()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  is_admin boolean := public.is_platform_admin() or auth.uid() is null;
begin
  if not is_admin then
    if (tg_op = 'UPDATE' and (new.role = 'owner' or old.role = 'owner'))
       or (tg_op = 'DELETE' and old.role = 'owner' and old.user_id <> auth.uid()) then
      if not public.has_org_role(old.organization_id, array['owner']::public.org_role[]) then
        raise exception 'Solo un propietario puede modificar a otro propietario' using errcode = '42501';
      end if;
    end if;
  end if;
  if (tg_op = 'DELETE' and old.role = 'owner') or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if not exists (select 1 from public.organization_members
                   where organization_id = old.organization_id and role = 'owner' and user_id <> old.user_id) then
      -- permitir si la empresa entera se está eliminando
      if exists (select 1 from public.organizations where id = old.organization_id) then
        raise exception 'La empresa debe tener al menos un propietario' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger members_protect_owners before update or delete on public.organization_members
  for each row execute function public.protect_owners();

-- Solo el administrador de la plataforma cambia el estado de una empresa
create or replace function public.protect_org_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.status is distinct from old.status or new.suspended_reason is distinct from old.suspended_reason)
     and auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'Solo el administrador de CLIENTE360 puede cambiar el estado de la cuenta' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger organizations_protect_status before update on public.organizations
  for each row execute function public.protect_org_status();

-- ---------------------------------------------------------------------
-- Registro de actividad (auditoría)
-- ---------------------------------------------------------------------
create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  label_col text := tg_argv[0];
  entity text := tg_argv[1];
  act text;
  meta jsonb := '{}'::jsonb;
begin
  act := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  if tg_op = 'UPDATE' then
    if entity = 'lead' and (to_jsonb(new) ->> 'status') is distinct from (to_jsonb(old) ->> 'status') then
      act := 'status_changed';
      meta := jsonb_build_object('from', to_jsonb(old) ->> 'status', 'to', to_jsonb(new) ->> 'status');
    elsif entity = 'task' and (to_jsonb(new) ->> 'status') = 'completada'
          and (to_jsonb(old) ->> 'status') <> 'completada' then
      act := 'completed';
    end if;
  end if;
  if entity = 'interaction' then
    meta := meta || jsonb_build_object('type', rec ->> 'type', 'customer_id', rec ->> 'customer_id');
  end if;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, summary, metadata)
  values ((rec ->> 'organization_id')::uuid, auth.uid(), entity, (rec ->> 'id')::uuid, act,
          left(rec ->> label_col, 200), meta);
  return null;
exception when foreign_key_violation then
  -- la empresa se está eliminando: no registrar
  return null;
end $$;

create trigger customers_activity after insert or update or delete on public.customers
  for each row execute function public.log_activity('full_name', 'customer');
create trigger leads_activity after insert or update or delete on public.leads
  for each row execute function public.log_activity('title', 'lead');
create trigger tasks_activity after insert or update or delete on public.tasks
  for each row execute function public.log_activity('title', 'task');
create trigger interactions_activity after insert on public.interactions
  for each row execute function public.log_activity('content', 'interaction');
create trigger appointments_activity after insert or update or delete on public.appointments
  for each row execute function public.log_activity('title', 'appointment');

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.plans enable row level security;
alter table public.platform_admins enable row level security;
alter table public.platform_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.customers enable row level security;
alter table public.leads enable row level security;
alter table public.lead_status_changes enable row level security;
alter table public.interactions enable row level security;
alter table public.tasks enable row level security;
alter table public.appointments enable row level security;
alter table public.message_templates enable row level security;
alter table public.channel_connections enable row level security;
alter table public.channel_secrets enable row level security;   -- sin políticas: solo service_role
alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.ai_usage enable row level security;
alter table public.activity_logs enable row level security;

-- Plataforma ------------------------------------------------------------
create policy plans_read on public.plans for select to anon, authenticated
  using (is_active or public.is_platform_admin());
create policy plans_admin_write on public.plans for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy platform_admins_self on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

create policy platform_settings_read on public.platform_settings for select to authenticated using (true);
create policy platform_settings_admin on public.platform_settings for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Perfiles ----------------------------------------------------------------
create policy profiles_read on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or public.is_platform_admin()
  or exists (
    select 1 from public.organization_members m
    where m.user_id = profiles.id and public.is_org_member(m.organization_id)
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Empresas ----------------------------------------------------------------
create policy organizations_read on public.organizations for select to authenticated
  using (public.is_org_member(id) or public.is_platform_admin());
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner','admin']::public.org_role[]) or public.is_platform_admin())
  with check (public.has_org_role(id, array['owner','admin']::public.org_role[]) or public.is_platform_admin());
-- alta solo mediante create_organization(); baja solo por el propietario
create policy organizations_delete on public.organizations for delete to authenticated
  using (public.has_org_role(id, array['owner']::public.org_role[]));

create policy members_read on public.organization_members for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy members_update on public.organization_members for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));
create policy members_delete on public.organization_members for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
         or user_id = (select auth.uid()));

create policy invitations_manage on public.organization_invitations for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
              and public.org_is_writable(organization_id));

-- Suscripciones y pagos: lectura para la empresa, escritura solo plataforma
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy subscriptions_admin on public.subscriptions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy payments_read on public.payments for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]) or public.is_platform_admin());
create policy payments_admin on public.payments for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Datos de negocio --------------------------------------------------------
-- Lectura: cualquier miembro. Escritura: miembros de empresas habilitadas.
-- Borrado: según rol.

-- customers
create policy customers_read on public.customers for select to authenticated
  using (public.is_org_member(organization_id));
create policy customers_insert on public.customers for insert to authenticated
  with check (public.is_org_member(organization_id) and public.org_is_writable(organization_id));
create policy customers_update on public.customers for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id) and public.org_is_writable(organization_id));
create policy customers_delete on public.customers for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
         and public.org_is_writable(organization_id));

-- leads
create policy leads_read on public.leads for select to authenticated
  using (public.is_org_member(organization_id));
create policy leads_insert on public.leads for insert to authenticated
  with check (public.is_org_member(organization_id) and public.org_is_writable(organization_id));
create policy leads_update on public.leads for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id) and public.org_is_writable(organization_id));
create policy leads_delete on public.leads for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','seller']::public.org_role[])
         and public.org_is_writable(organization_id));

create policy lead_status_changes_read on public.lead_status_changes for select to authenticated
  using (public.is_org_member(organization_id));

-- interactions
create policy interactions_read on public.interactions for select to authenticated
  using (public.is_org_member(organization_id));
create policy interactions_insert on public.interactions for insert to authenticated
  with check (public.is_org_member(organization_id) and public.org_is_writable(organization_id));
create policy interactions_update on public.interactions for update to authenticated
  using (public.is_org_member(organization_id)
         and (created_by = (select auth.uid()) or public.has_org_role(organization_id, array['owner','admin']::public.org_role[])))
  with check (public.org_is_writable(organization_id));
create policy interactions_delete on public.interactions for delete to authenticated
  using ((created_by = (select auth.uid()) or public.has_org_role(organization_id, array['owner','admin']::public.org_role[]))
         and public.is_org_member(organization_id) and public.org_is_writable(organization_id));

-- tasks
create policy tasks_read on public.tasks for select to authenticated
  using (public.is_org_member(organization_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_org_member(organization_id) and public.org_is_writable(organization_id));
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id) and public.org_is_writable(organization_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_org_member(organization_id) and public.org_is_writable(organization_id)
         and (created_by = (select auth.uid()) or public.has_org_role(organization_id, array['owner','admin']::public.org_role[])));

-- appointments
create policy appointments_read on public.appointments for select to authenticated
  using (public.is_org_member(organization_id));
create policy appointments_insert on public.appointments for insert to authenticated
  with check (public.is_org_member(organization_id) and public.org_is_writable(organization_id));
create policy appointments_update on public.appointments for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id) and public.org_is_writable(organization_id));
create policy appointments_delete on public.appointments for delete to authenticated
  using (public.is_org_member(organization_id) and public.org_is_writable(organization_id)
         and (created_by = (select auth.uid()) or public.has_org_role(organization_id, array['owner','admin','seller']::public.org_role[])));

-- message_templates
create policy templates_read on public.message_templates for select to authenticated
  using (public.is_org_member(organization_id));
create policy templates_insert on public.message_templates for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','seller']::public.org_role[])
              and public.org_is_writable(organization_id));
create policy templates_update on public.message_templates for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','seller']::public.org_role[]))
  with check (public.org_is_writable(organization_id));
create policy templates_delete on public.message_templates for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

-- channel_connections (solo propietario/administrador autorizan canales)
create policy channels_read on public.channel_connections for select to authenticated
  using (public.is_org_member(organization_id));
create policy channels_write on public.channel_connections for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
              and public.org_is_writable(organization_id));

-- automations
create policy automations_read on public.automations for select to authenticated
  using (public.is_org_member(organization_id));
create policy automations_write on public.automations for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
              and public.org_is_writable(organization_id));
create policy automation_runs_read on public.automation_runs for select to authenticated
  using (public.is_org_member(organization_id));

-- ai_usage
create policy ai_usage_read on public.ai_usage for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
         or (user_id = (select auth.uid()) and public.is_org_member(organization_id))
         or public.is_platform_admin());

-- activity_logs
-- (el admin de plataforma usa agregados: no lee el detalle de actividad de las empresas)
create policy activity_read on public.activity_logs for select to authenticated
  using (public.is_org_member(organization_id));
