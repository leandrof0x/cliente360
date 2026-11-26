-- =====================================================================
-- CLIENTE360 · Funciones de negocio (RPC) y configuración inicial de planes
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configuración inicial (editable desde el panel de administración)
-- No son datos de clientes: son los planes comerciales del producto.
-- ---------------------------------------------------------------------
insert into public.plans (id, name, description, price_gs, max_users, max_customers, ai_monthly_requests, features, sort_order)
values
  ('inicial', 'Inicial', 'Para emprendedores que empiezan a ordenar sus ventas.', 79000, 1, 100, 0,
   '{"crm": true, "pipeline": true, "followups": "basic", "dashboard": true, "templates": true, "agenda": true,
     "reports": false, "exports": false, "automations": false, "ai": false, "team": false}', 1),
  ('profesional', 'Profesional', 'Para negocios que quieren vender más con seguimiento y automatización.', 149000, 3, null, 200,
   '{"crm": true, "pipeline": true, "followups": "full", "dashboard": true, "templates": true, "agenda": true,
     "reports": true, "exports": true, "automations": "basic", "ai": "limited", "team": false}', 2),
  ('negocio', 'Negocio', 'Para equipos comerciales con varios vendedores.', 249000, 10, null, 1000,
   '{"crm": true, "pipeline": true, "followups": "full", "dashboard": true, "templates": true, "agenda": true,
     "reports": "advanced", "exports": true, "automations": "advanced", "ai": "extended", "team": true}', 3)
on conflict (id) do nothing;

insert into public.platform_settings (key, value) values
  ('trial_days', '14'::jsonb),
  ('trial_plan', '"profesional"'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Alta de empresa: crea la organización, el propietario y la prueba gratis
-- ---------------------------------------------------------------------
create or replace function public.create_organization(p_name text, p_phone text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  org_id uuid;
  base_slug text;
  final_slug text;
  t_days integer;
  t_plan text;
begin
  if uid is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) < 2 or length(trim(p_name)) > 120 then
    raise exception 'El nombre de la empresa debe tener entre 2 y 120 caracteres' using errcode = '22023';
  end if;
  -- límite anti abuso: un usuario puede ser propietario de hasta 5 empresas
  if (select count(*) from public.organization_members where user_id = uid and role = 'owner') >= 5 then
    raise exception 'Alcanzaste el máximo de empresas por usuario' using errcode = 'P0001';
  end if;

  base_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if base_slug = '' then base_slug := 'empresa'; end if;
  final_slug := left(base_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  select coalesce((value #>> '{}')::integer, 14) into t_days from public.platform_settings where key = 'trial_days';
  select coalesce(value #>> '{}', 'profesional') into t_plan from public.platform_settings where key = 'trial_plan';
  t_days := coalesce(t_days, 14);
  t_plan := coalesce(t_plan, 'profesional');

  insert into public.organizations (name, slug, phone, created_by)
  values (trim(p_name), final_slug, nullif(trim(coalesce(p_phone, '')), ''), uid)
  returning id into org_id;

  insert into public.subscriptions (organization_id, plan_id, status, trial_ends_at, price_gs)
  select org_id, p.id, 'trialing', now() + make_interval(days => t_days), p.price_gs
  from public.plans p where p.id = t_plan;

  insert into public.organization_members (organization_id, user_id, role)
  values (org_id, uid, 'owner');

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, summary)
  values (org_id, uid, 'organization', org_id, 'created', trim(p_name));

  return org_id;
end $$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Aceptar invitación al equipo
-- ---------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv public.organization_invitations;
  user_email text;
begin
  if uid is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  select * into inv from public.organization_invitations
   where token = p_token and accepted_at is null and expires_at > now();
  if not found then
    raise exception 'La invitación no existe o expiró' using errcode = 'P0002';
  end if;
  select email into user_email from auth.users where id = uid;
  if lower(user_email) <> lower(inv.email::text) then
    raise exception 'Esta invitación fue enviada a otro correo' using errcode = '42501';
  end if;
  insert into public.organization_members (organization_id, user_id, role)
  values (inv.organization_id, uid, inv.role)
  on conflict (organization_id, user_id) do nothing;
  update public.organization_invitations set accepted_at = now() where id = inv.id;
  return inv.organization_id;
end $$;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------
-- Dashboard: todos los indicadores salen de datos reales.
-- SECURITY INVOKER: las políticas RLS se aplican también aquí.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_data(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_no_contact_days integer default 7
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  tz text;
  bucket text;
  result jsonb;
begin
  if not public.is_org_member(p_org) then
    raise exception 'Sin acceso a esta empresa' using errcode = '42501';
  end if;
  if p_to <= p_from then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;

  select timezone into tz from public.organizations where id = p_org;
  tz := coalesce(tz, 'America/Asuncion');
  bucket := case
    when p_to - p_from <= interval '45 days' then 'day'
    when p_to - p_from <= interval '200 days' then 'week'
    else 'month' end;

  with
  c_total as (select count(*) n from public.customers where organization_id = p_org),
  c_new as (select count(*) n from public.customers
            where organization_id = p_org and created_at >= p_from and created_at < p_to),
  l_range as (select * from public.leads
              where organization_id = p_org and created_at >= p_from and created_at < p_to),
  l_open as (select count(*) n, coalesce(sum(estimated_value), 0) v from public.leads
             where organization_id = p_org and status not in ('ganado', 'perdido')),
  l_won as (select count(*) n, coalesce(sum(estimated_value), 0) v from public.leads
            where organization_id = p_org and status = 'ganado' and won_at >= p_from and won_at < p_to),
  l_lost as (select count(*) n from public.leads
             where organization_id = p_org and status = 'perdido' and lost_at >= p_from and lost_at < p_to),
  l_unanswered as (select count(*) n from public.leads where organization_id = p_org and status = 'nueva'),
  t_pending as (
    select count(*) filter (where true) total,
           count(*) filter (where due_at < now()) overdue,
           count(*) filter (where due_at >= date_trunc('day', now() at time zone tz) at time zone tz
                              and due_at < (date_trunc('day', now() at time zone tz) + interval '1 day') at time zone tz) today
    from public.tasks where organization_id = p_org and status = 'pendiente'),
  l_followups_due as (select count(*) n from public.leads
                      where organization_id = p_org and status not in ('ganado','perdido')
                        and next_follow_up_at is not null and next_follow_up_at < now()),
  c_no_contact as (
    select count(distinct c.id) n
    from public.customers c
    join public.leads l on l.customer_id = c.id and l.status not in ('ganado', 'perdido')
    where c.organization_id = p_org
      and coalesce(c.last_contact_at, c.created_at) < now() - make_interval(days => p_no_contact_days)),
  buckets as (
    select gs as b
    from generate_series(date_trunc(bucket, p_from at time zone tz),
                         date_trunc(bucket, (p_to - interval '1 second') at time zone tz),
                         ('1 ' || bucket)::interval) gs),
  series as (
    select b,
      (select count(*) from public.customers c where c.organization_id = p_org
         and date_trunc(bucket, c.created_at at time zone tz) = b
         and c.created_at >= p_from and c.created_at < p_to) new_customers,
      (select count(*) from public.customers c where c.organization_id = p_org
         and c.created_at < (b + ('1 ' || bucket)::interval) at time zone tz) total_customers,
      (select count(*) from l_range l where date_trunc(bucket, l.created_at at time zone tz) = b) leads,
      (select count(*) from public.leads l where l.organization_id = p_org and l.status = 'ganado'
         and l.won_at >= p_from and l.won_at < p_to
         and date_trunc(bucket, l.won_at at time zone tz) = b) won_count,
      (select coalesce(sum(estimated_value), 0) from public.leads l where l.organization_id = p_org
         and l.status = 'ganado' and l.won_at >= p_from and l.won_at < p_to
         and date_trunc(bucket, l.won_at at time zone tz) = b) won_value
    from buckets),
  stage_order(status, rank) as (
    values ('nueva'::public.lead_status, 1), ('contactado', 2), ('interesado', 3),
           ('seguimiento', 4), ('negociacion', 5), ('ganado', 6)),
  reached as (
    select l.id, max(so.rank) max_rank
    from l_range l
    join public.lead_status_changes h on h.lead_id = l.id
    join stage_order so on so.status = h.to_status
    group by l.id),
  funnel as (
    select so.status, so.rank, (select count(*) from reached r where r.max_rank >= so.rank) n
    from stage_order so),
  distribution as (
    select s.status, count(l.id) n, coalesce(sum(l.estimated_value), 0) v
    from unnest(enum_range(null::public.lead_status)) s(status)
    left join l_range l on l.status = s.status
    group by s.status)
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'bucket', bucket, 'timezone', tz),
    'kpis', jsonb_build_object(
      'total_customers', (select n from c_total),
      'new_customers', (select n from c_new),
      'leads_received', (select count(*) from l_range),
      'open_leads', (select n from l_open),
      'open_value', (select v from l_open),
      'won_count', (select n from l_won),
      'won_value', (select v from l_won),
      'lost_count', (select n from l_lost),
      'conversion_rate', (select case when count(*) = 0 then null
                                 else round(100.0 * count(*) filter (where status = 'ganado') / count(*), 1) end
                          from l_range),
      'unanswered_leads', (select n from l_unanswered),
      'pending_tasks', (select total from t_pending),
      'overdue_tasks', (select overdue from t_pending),
      'today_tasks', (select today from t_pending),
      'overdue_lead_followups', (select n from l_followups_due),
      'no_contact_customers', (select n from c_no_contact),
      'no_contact_days', p_no_contact_days),
    'series', coalesce((select jsonb_agg(jsonb_build_object(
        'bucket', to_char(b, 'YYYY-MM-DD'), 'new_customers', new_customers, 'total_customers', total_customers,
        'leads', leads, 'won_count', won_count, 'won_value', won_value) order by b) from series), '[]'::jsonb),
    'funnel', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'count', n) order by rank) from funnel), '[]'::jsonb),
    'distribution', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'count', n, 'value', v)) from distribution), '[]'::jsonb)
  ) into result;

  return result;
end $$;

revoke all on function public.dashboard_data(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.dashboard_data(uuid, timestamptz, timestamptz, integer) to authenticated;

-- Funciones auxiliares: solo para usuarios autenticados
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.org_role_of(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, public.org_role[]) from public, anon;
revoke all on function public.org_is_writable(uuid) from public, anon;
revoke all on function public.org_plan(uuid) from public, anon;
revoke all on function public.org_has_feature(uuid, text) from public, anon;
grant execute on function public.is_platform_admin() to anon, authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.org_role_of(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated;
grant execute on function public.org_is_writable(uuid) to authenticated;
grant execute on function public.org_plan(uuid) to authenticated;
grant execute on function public.org_has_feature(uuid, text) to authenticated;
