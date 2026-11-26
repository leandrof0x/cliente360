-- =====================================================================
-- CLIENTE360 · Etapa 5: equipo, suscripción y panel de la plataforma
-- =====================================================================

-- ---------------------------------------------------------------------
-- Equipo: invitaciones
-- ---------------------------------------------------------------------
-- Una invitación ocupa un lugar del plan mientras está pendiente.
create or replace function public.enforce_invitation_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lim integer;
  used integer;
begin
  if auth.uid() is not null and not public.has_org_role(new.organization_id, array['owner','admin']::public.org_role[]) then
    raise exception 'Solo propietarios y administradores invitan al equipo' using errcode = '42501';
  end if;
  new.email := lower(trim(new.email));
  if new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Correo inválido' using errcode = '22023';
  end if;
  if exists (select 1 from public.organization_members m join auth.users u on u.id = m.user_id
             where m.organization_id = new.organization_id and lower(u.email) = new.email) then
    raise exception 'Esa persona ya es parte del equipo' using errcode = 'P0001';
  end if;
  select p.max_users into lim
    from public.subscriptions s join public.plans p on p.id = s.plan_id
   where s.organization_id = new.organization_id;
  select (select count(*) from public.organization_members where organization_id = new.organization_id)
       + (select count(*) from public.organization_invitations
           where organization_id = new.organization_id and accepted_at is null and expires_at > now())
    into used;
  if lim is not null and used >= lim then
    raise exception 'Tu plan permite hasta % usuarios (contando invitaciones pendientes).', lim
      using errcode = 'P0001', hint = 'plan_limit_users';
  end if;
  new.invited_by := auth.uid();
  return new;
end $$;

create trigger invitations_plan_limit before insert on public.organization_invitations
  for each row execute function public.enforce_invitation_limit();

-- Datos mínimos de una invitación para mostrar la pantalla de aceptación.
create or replace function public.invitation_info(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  inv public.organization_invitations;
  org_name text;
  user_email text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  select * into inv from public.organization_invitations where token = p_token;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  select name into org_name from public.organizations where id = inv.organization_id;
  select email into user_email from auth.users where id = auth.uid();
  return jsonb_build_object(
    'found', true,
    'organization', org_name,
    'role', inv.role,
    'email_matches', lower(user_email) = lower(inv.email),
    -- solo se revela el correo invitado a quien ya es esa persona
    'email', case when lower(user_email) = lower(inv.email) then inv.email
                  else regexp_replace(inv.email, '^(.).*(@.*)$', '\1***\2') end,
    'accepted', inv.accepted_at is not null,
    'expired', inv.expires_at <= now(),
    'already_member', exists (select 1 from public.organization_members
                              where organization_id = inv.organization_id and user_id = auth.uid()));
end $$;
revoke all on function public.invitation_info(text) from public, anon;
grant execute on function public.invitation_info(text) to authenticated;

-- ---------------------------------------------------------------------
-- Solicitudes de cambio de plan (sin cobros: la plataforma las aprueba
-- al confirmar el pago o cuando se integre una pasarela)
-- ---------------------------------------------------------------------
create table public.plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_plan text not null references public.plans(id),
  current_plan text references public.plans(id),
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  message text check (message is null or length(message) <= 1000),
  admin_note text check (admin_note is null or length(admin_note) <= 1000),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index plan_change_requests_pending_uq on public.plan_change_requests(organization_id) where status = 'pendiente';
create index plan_change_requests_status_idx on public.plan_change_requests(status, created_at desc);
alter table public.plan_change_requests enable row level security;

create policy plan_requests_read on public.plan_change_requests for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]) or public.is_platform_admin());

-- La empresa solo crea y cancela; aprobar o rechazar es exclusivo de la plataforma (RPC).
create or replace function public.request_plan_change(p_org uuid, p_plan text, p_message text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  cur text;
  new_id uuid;
begin
  if not public.has_org_role(p_org, array['owner','admin']::public.org_role[]) then
    raise exception 'Solo propietarios y administradores pueden cambiar el plan' using errcode = '42501';
  end if;
  if not exists (select 1 from public.plans where id = p_plan and is_active) then
    raise exception 'Plan inválido' using errcode = '22023';
  end if;
  select plan_id into cur from public.subscriptions where organization_id = p_org;
  if cur = p_plan and exists (select 1 from public.subscriptions where organization_id = p_org and status = 'active') then
    raise exception 'Ya tenés ese plan activo' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.plan_change_requests where organization_id = p_org and status = 'pendiente') then
    raise exception 'Ya hay una solicitud pendiente. Cancelala para pedir otro plan.' using errcode = 'P0001';
  end if;
  insert into public.plan_change_requests (organization_id, requested_plan, current_plan, requested_by, message)
  values (p_org, p_plan, cur, auth.uid(), nullif(left(trim(coalesce(p_message, '')), 1000), ''))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.cancel_plan_request(p_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.plan_change_requests r set status = 'cancelada', resolved_at = now(), resolved_by = auth.uid()
   where r.id = p_id and r.status = 'pendiente'
     and public.has_org_role(r.organization_id, array['owner','admin']::public.org_role[]);
  return found;
end $$;

revoke all on function public.request_plan_change(uuid, text, text) from public, anon;
revoke all on function public.cancel_plan_request(uuid) from public, anon;
grant execute on function public.request_plan_change(uuid, text, text) to authenticated;
grant execute on function public.cancel_plan_request(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Panel de la plataforma (solo administradores de CLIENTE360)
-- Solo datos de cuenta y agregados: nunca el detalle de clientes de las empresas.
-- ---------------------------------------------------------------------
create or replace function public.assert_platform_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acceso solo para administradores de CLIENTE360' using errcode = '42501';
  end if;
end $$;

create or replace function public.platform_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  return jsonb_build_object(
    'organizations', (select count(*) from public.organizations),
    'suspended', (select count(*) from public.organizations where status = 'suspended'),
    'trialing', (select count(*) from public.subscriptions where status = 'trialing' and trial_ends_at > now()),
    'trial_expired', (select count(*) from public.subscriptions where status = 'trialing' and trial_ends_at <= now()),
    'active', (select count(*) from public.subscriptions where status = 'active'),
    'past_due', (select count(*) from public.subscriptions where status in ('past_due', 'suspended')),
    'trials_ending_7d', (select count(*) from public.subscriptions
                          where status = 'trialing' and trial_ends_at > now() and trial_ends_at <= now() + interval '7 days'),
    'renewals_due_7d', (select count(*) from public.subscriptions
                         where status = 'active' and current_period_end <= now() + interval '7 days'),
    -- ingreso mensual recurrente: suscripciones activas al precio pactado
    'mrr_gs', (select coalesce(sum(coalesce(price_gs, 0)), 0) from public.subscriptions where status = 'active'),
    'paid_last_30d_gs', (select coalesce(sum(amount_gs), 0) from public.payments
                          where status = 'paid' and paid_at >= now() - interval '30 days'),
    'users', (select count(distinct user_id) from public.organization_members),
    'pending_plan_requests', (select count(*) from public.plan_change_requests where status = 'pendiente'),
    'by_plan', coalesce((select jsonb_agg(jsonb_build_object('plan', p.name, 'count', x.n) order by p.sort_order)
                           from (select plan_id, count(*) n from public.subscriptions group by plan_id) x
                           join public.plans p on p.id = x.plan_id), '[]'::jsonb));
end $$;

create or replace function public.platform_organizations(p_search text default null)
returns table (
  id uuid, name text, created_at timestamptz, status public.org_status, suspended_reason text,
  owner_email text, plan_id text, plan_name text, sub_status public.subscription_status,
  trial_ends_at timestamptz, current_period_end timestamptz, price_gs integer,
  members bigint, customers bigint, leads bigint, last_activity timestamptz, pending_request text
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  return query
  select o.id, o.name, o.created_at, o.status, o.suspended_reason,
    (select u.email::text from public.organization_members m join auth.users u on u.id = m.user_id
      where m.organization_id = o.id and m.role = 'owner' order by m.created_at limit 1),
    s.plan_id, p.name, s.status, s.trial_ends_at, s.current_period_end, s.price_gs,
    (select count(*) from public.organization_members m where m.organization_id = o.id),
    (select count(*) from public.customers c where c.organization_id = o.id),
    (select count(*) from public.leads l where l.organization_id = o.id),
    (select max(a.created_at) from public.activity_logs a where a.organization_id = o.id),
    (select r.requested_plan from public.plan_change_requests r where r.organization_id = o.id and r.status = 'pendiente')
  from public.organizations o
  left join public.subscriptions s on s.organization_id = o.id
  left join public.plans p on p.id = s.plan_id
  where p_search is null or p_search = ''
     or o.name ilike '%' || p_search || '%'
     or exists (select 1 from public.organization_members m join auth.users u on u.id = m.user_id
                 where m.organization_id = o.id and u.email ilike '%' || p_search || '%')
  order by o.created_at desc
  limit 500;
end $$;

create or replace function public.platform_log(p_org uuid, p_action text, p_summary text, p_meta jsonb default '{}'::jsonb)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, summary, metadata)
  values (p_org, auth.uid(), 'subscription', p_org, p_action, p_summary, coalesce(p_meta, '{}'::jsonb));
$$;
revoke all on function public.platform_log(uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function public.platform_update_subscription(
  p_org uuid, p_plan text, p_status public.subscription_status,
  p_trial_ends_at timestamptz, p_period_end timestamptz, p_price_gs integer, p_notes text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  old public.subscriptions;
begin
  perform public.assert_platform_admin();
  if not exists (select 1 from public.plans where id = p_plan) then
    raise exception 'Plan inválido' using errcode = '22023';
  end if;
  if p_price_gs is not null and p_price_gs < 0 then
    raise exception 'Precio inválido' using errcode = '22023';
  end if;
  select * into old from public.subscriptions where organization_id = p_org for update;
  if not found then
    insert into public.subscriptions (organization_id, plan_id, status, trial_ends_at, current_period_end, price_gs, notes)
    values (p_org, p_plan, p_status, p_trial_ends_at, p_period_end, p_price_gs, p_notes);
  else
    update public.subscriptions
       set plan_id = p_plan, status = p_status, trial_ends_at = p_trial_ends_at,
           current_period_end = p_period_end,
           current_period_start = case when p_period_end is distinct from old.current_period_end then coalesce(old.current_period_end, now()) else current_period_start end,
           price_gs = p_price_gs, notes = coalesce(p_notes, notes)
     where organization_id = p_org;
  end if;
  perform public.platform_log(p_org, 'subscription_updated',
    format('Suscripción: plan %s, estado %s', p_plan, p_status),
    jsonb_build_object('from_plan', old.plan_id, 'from_status', old.status, 'to_plan', p_plan, 'to_status', p_status));
end $$;

-- Registra un pago confirmado (transferencia, efectivo, pasarela) y extiende el período.
create or replace function public.platform_record_payment(
  p_org uuid, p_amount_gs integer, p_months integer, p_method text, p_reference text default null, p_notes text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  sub public.subscriptions;
  start_at timestamptz;
  end_at timestamptz;
  pay_id uuid;
begin
  perform public.assert_platform_admin();
  if p_amount_gs is null or p_amount_gs <= 0 then raise exception 'Monto inválido' using errcode = '22023'; end if;
  if p_months is null or p_months < 1 or p_months > 24 then raise exception 'Meses inválidos (1 a 24)' using errcode = '22023'; end if;
  if coalesce(trim(p_method), '') = '' then raise exception 'Indicá el medio de pago' using errcode = '22023'; end if;
  select * into sub from public.subscriptions where organization_id = p_org for update;
  if not found then raise exception 'La empresa no tiene suscripción' using errcode = 'P0002'; end if;

  -- si todavía está vigente, se suma desde el vencimiento; si no, desde hoy
  start_at := greatest(now(), coalesce(case when sub.status = 'active' then sub.current_period_end end, now()));
  end_at := start_at + make_interval(months => p_months);

  insert into public.payments (organization_id, subscription_id, plan_id, amount_gs, status, method, provider_ref,
                               period_start, period_end, paid_at, notes, recorded_by)
  values (p_org, sub.id, sub.plan_id, p_amount_gs, 'paid', left(trim(p_method), 60), nullif(left(trim(coalesce(p_reference, '')), 120), ''),
          (start_at at time zone 'America/Asuncion')::date, (end_at at time zone 'America/Asuncion')::date, now(),
          nullif(left(trim(coalesce(p_notes, '')), 1000), ''), auth.uid())
  returning id into pay_id;

  update public.subscriptions
     set status = 'active', current_period_start = start_at, current_period_end = end_at,
         price_gs = round(p_amount_gs::numeric / p_months)::integer
   where id = sub.id;
  perform public.platform_log(p_org, 'payment_recorded',
    format('Pago registrado: Gs. %s por %s mes(es)', p_amount_gs, p_months),
    jsonb_build_object('payment_id', pay_id, 'method', p_method, 'period_end', end_at));
  return pay_id;
end $$;

create or replace function public.platform_resolve_plan_request(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.plan_change_requests;
  new_price integer;
begin
  perform public.assert_platform_admin();
  select * into r from public.plan_change_requests where id = p_id and status = 'pendiente' for update;
  if not found then raise exception 'La solicitud no existe o ya fue resuelta' using errcode = 'P0002'; end if;
  update public.plan_change_requests
     set status = case when p_approve then 'aprobada' else 'rechazada' end,
         admin_note = nullif(left(trim(coalesce(p_note, '')), 1000), ''), resolved_by = auth.uid(), resolved_at = now()
   where id = p_id;
  if p_approve then
    select price_gs into new_price from public.plans where id = r.requested_plan;
    update public.subscriptions set plan_id = r.requested_plan, price_gs = new_price where organization_id = r.organization_id;
  end if;
  perform public.platform_log(r.organization_id, case when p_approve then 'plan_request_approved' else 'plan_request_rejected' end,
    format('Solicitud de plan %s %s', r.requested_plan, case when p_approve then 'aprobada' else 'rechazada' end), '{}'::jsonb);
end $$;

create or replace function public.platform_set_org_status(p_org uuid, p_status public.org_status, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  if p_status = 'suspended' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Indicá el motivo de la suspensión' using errcode = '22023';
  end if;
  update public.organizations
     set status = p_status, suspended_reason = case when p_status = 'suspended' then left(trim(p_reason), 300) else null end
   where id = p_org;
  if not found then raise exception 'Empresa inexistente' using errcode = 'P0002'; end if;
  perform public.platform_log(p_org, case when p_status = 'suspended' then 'organization_suspended' else 'organization_reactivated' end,
    case when p_status = 'suspended' then 'Cuenta suspendida: ' || p_reason else 'Cuenta reactivada' end, '{}'::jsonb);
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'public.assert_platform_admin()',
    'public.platform_stats()',
    'public.platform_organizations(text)',
    'public.platform_update_subscription(uuid, text, public.subscription_status, timestamptz, timestamptz, integer, text)',
    'public.platform_record_payment(uuid, integer, integer, text, text, text)',
    'public.platform_resolve_plan_request(uuid, boolean, text)',
    'public.platform_set_org_status(uuid, public.org_status, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Instrucciones de pago visibles para las empresas (editables desde el panel)
insert into public.platform_settings (key, value) values ('payment_instructions', '""'::jsonb)
on conflict (key) do nothing;
insert into public.platform_settings (key, value) values ('support_contact', '""'::jsonb)
on conflict (key) do nothing;
