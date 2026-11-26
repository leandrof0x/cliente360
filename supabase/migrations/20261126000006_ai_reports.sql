-- =====================================================================
-- CLIENTE360 · Etapa 4: cupo de CLIENTE AI y reportes comerciales
-- =====================================================================

-- ---------------------------------------------------------------------
-- CLIENTE AI: cupo mensual por plan
-- El mes se cuenta en hora de Paraguay. Las consultas se reservan ANTES de
-- llamar al proveedor (bloqueo por empresa, sin carreras) y se liberan si el
-- proveedor falla: una consulta fallida no consume cupo.
-- ---------------------------------------------------------------------
create or replace function public.ai_month_start()
returns timestamptz language sql stable set search_path = '' as $$
  select date_trunc('month', now() at time zone 'America/Asuncion') at time zone 'America/Asuncion'
$$;

create or replace function public.ai_quota(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  lim integer;
  used integer;
begin
  if not public.is_org_member(p_org) then
    raise exception 'Sin acceso a esta empresa' using errcode = '42501';
  end if;
  select p.ai_monthly_requests into lim
    from public.subscriptions s join public.plans p on p.id = s.plan_id
   where s.organization_id = p_org;
  select count(*) into used from public.ai_usage
   where organization_id = p_org and created_at >= public.ai_month_start();
  return jsonb_build_object(
    'enabled', public.org_has_feature(p_org, 'ai') and coalesce(lim, 0) > 0,
    'writable', public.org_is_writable(p_org),
    'limit', coalesce(lim, 0),
    'used', used,
    'remaining', greatest(coalesce(lim, 0) - used, 0),
    'period_start', public.ai_month_start());
end $$;

create or replace function public.ai_reserve_request(p_org uuid, p_feature text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  lim integer;
  used integer;
  new_id bigint;
begin
  if not public.is_org_member(p_org) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_feature is null or p_feature !~ '^[a-z_]{2,40}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_feature');
  end if;
  if not public.org_is_writable(p_org) then
    return jsonb_build_object('ok', false, 'reason', 'read_only');
  end if;
  select p.ai_monthly_requests into lim
    from public.subscriptions s join public.plans p on p.id = s.plan_id
   where s.organization_id = p_org;
  if not public.org_has_feature(p_org, 'ai') or coalesce(lim, 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_in_plan');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_quota:' || p_org::text, 0));
  select count(*) into used from public.ai_usage
   where organization_id = p_org and created_at >= public.ai_month_start();
  if used >= lim then
    return jsonb_build_object('ok', false, 'reason', 'limit_reached', 'limit', lim, 'used', used);
  end if;

  insert into public.ai_usage (organization_id, user_id, feature, provider, model)
  values (p_org, auth.uid(), p_feature, 'pendiente', 'pendiente')
  returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id, 'limit', lim, 'used', used + 1);
end $$;

-- Completa la reserva con el consumo real (solo la propia y solo una vez)
create or replace function public.ai_complete_request(p_id bigint, p_provider text, p_model text,
                                                      p_input_tokens integer, p_output_tokens integer)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.ai_usage
     set provider = left(coalesce(p_provider, 'desconocido'), 40),
         model = left(coalesce(p_model, 'desconocido'), 80),
         input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = greatest(coalesce(p_output_tokens, 0), 0)
   where id = p_id and user_id = auth.uid() and provider = 'pendiente'
     and created_at > now() - interval '30 minutes';
  return found;
end $$;

-- Libera la reserva cuando el proveedor falló (no se cobra cupo por errores)
create or replace function public.ai_release_request(p_id bigint)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from public.ai_usage
   where id = p_id and user_id = auth.uid() and provider = 'pendiente'
     and created_at > now() - interval '30 minutes';
  return found;
end $$;

revoke all on function public.ai_quota(uuid) from public, anon;
revoke all on function public.ai_reserve_request(uuid, text) from public, anon;
revoke all on function public.ai_complete_request(bigint, text, text, integer, integer) from public, anon;
revoke all on function public.ai_release_request(bigint) from public, anon;
grant execute on function public.ai_quota(uuid) to authenticated;
grant execute on function public.ai_reserve_request(uuid, text) to authenticated;
grant execute on function public.ai_complete_request(bigint, text, text, integer, integer) to authenticated;
grant execute on function public.ai_release_request(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- Reportes comerciales (solo Propietario/Administrador y planes con reportes)
-- SECURITY INVOKER: además de la verificación explícita, RLS sigue aplicando.
-- ---------------------------------------------------------------------
create or replace function public.report_data(p_org uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  result jsonb;
begin
  if not public.has_org_role(p_org, array['owner','admin']::public.org_role[]) then
    raise exception 'Solo propietarios y administradores ven los reportes' using errcode = '42501';
  end if;
  if not public.org_has_feature(p_org, 'reports') then
    raise exception 'Tu plan no incluye reportes' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '800 days' then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;

  with
  won as (
    select l.* from public.leads l
     where l.organization_id = p_org and l.status = 'ganado' and l.won_at >= p_from and l.won_at < p_to),
  lost as (
    select l.* from public.leads l
     where l.organization_id = p_org and l.status = 'perdido' and l.lost_at >= p_from and l.lost_at < p_to),
  received as (
    select l.* from public.leads l
     where l.organization_id = p_org and l.created_at >= p_from and l.created_at < p_to),
  new_customers as (
    select c.* from public.customers c
     where c.organization_id = p_org and c.created_at >= p_from and c.created_at < p_to),
  -- Cliente recurrente: compró en el período y ya tenía al menos otra venta ganada antes
  buyers as (
    select w.customer_id,
           exists (select 1 from public.leads p
                    where p.organization_id = p_org and p.customer_id = w.customer_id
                      and p.status = 'ganado' and p.won_at < p_from) as had_previous,
           count(*) as wins
      from won w group by w.customer_id),
  inbound as (
    select count(*) n from public.interactions i
     where i.organization_id = p_org and i.direction = 'entrante'
       and i.occurred_at >= p_from and i.occurred_at < p_to),
  tasks_done as (
    select t.* from public.tasks t
     where t.organization_id = p_org and t.status = 'completada'
       and t.completed_at >= p_from and t.completed_at < p_to),
  tasks_pending as (
    select t.* from public.tasks t
     where t.organization_id = p_org and t.status = 'pendiente'
       and (t.due_at is null or t.due_at < p_to)),
  members as (
    select m.user_id from public.organization_members m where m.organization_id = p_org),
  sellers as (
    select m.user_id,
      (select count(*) from received r where r.assigned_to = m.user_id) leads_received,
      (select count(*) from won w where w.assigned_to = m.user_id) won_count,
      (select coalesce(sum(w.estimated_value), 0) from won w where w.assigned_to = m.user_id) won_value,
      (select count(*) from lost l where l.assigned_to = m.user_id) lost_count,
      (select count(*) from tasks_done t where t.assigned_to = m.user_id) tasks_done,
      (select count(*) from tasks_pending t where t.assigned_to = m.user_id) tasks_pending,
      (select count(*) from tasks_pending t where t.assigned_to = m.user_id and t.due_at < now()) tasks_overdue
    from members m
    union all
    select null,
      (select count(*) from received r where r.assigned_to is null),
      (select count(*) from won w where w.assigned_to is null),
      (select coalesce(sum(w.estimated_value), 0) from won w where w.assigned_to is null),
      (select count(*) from lost l where l.assigned_to is null),
      (select count(*) from tasks_done t where t.assigned_to is null),
      (select count(*) from tasks_pending t where t.assigned_to is null),
      (select count(*) from tasks_pending t where t.assigned_to is null and t.due_at < now())
  ),
  sources as (
    select coalesce(nullif(trim(c.source), ''), 'Sin especificar') source,
           count(distinct c.id) filter (where c.created_at >= p_from and c.created_at < p_to) new_customers,
           count(w.id) won_count,
           coalesce(sum(w.estimated_value), 0) won_value
      from public.customers c
      left join won w on w.customer_id = c.id
     where c.organization_id = p_org
     group by 1),
  lost_reasons as (
    select coalesce(nullif(trim(l.lost_reason), ''), 'Sin motivo registrado') reason, count(*) n,
           coalesce(sum(l.estimated_value), 0) v
      from lost l group by 1)
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'summary', jsonb_build_object(
      'new_customers', (select count(*) from new_customers),
      'buying_customers', (select count(*) from buyers),
      'recurring_customers', (select count(*) from buyers where had_previous or wins > 1),
      'inquiries', (select count(*) from received),
      'inbound_messages', (select n from inbound),
      'won_count', (select count(*) from won),
      'won_value', (select coalesce(sum(estimated_value), 0) from won),
      'avg_ticket', (select case when count(*) = 0 then null else round(avg(estimated_value)) end from won),
      'lost_count', (select count(*) from lost),
      'lost_value', (select coalesce(sum(estimated_value), 0) from lost),
      -- Conversión de cierre: ganadas / (ganadas + perdidas) cerradas en el período
      'close_rate', (select case when (select count(*) from won) + (select count(*) from lost) = 0 then null
                     else round(100.0 * (select count(*) from won) / ((select count(*) from won) + (select count(*) from lost)), 1) end),
      -- Conversión de consultas: consultas del período que ya terminaron ganadas
      'inquiry_conversion', (select case when count(*) = 0 then null
                             else round(100.0 * count(*) filter (where status = 'ganado') / count(*), 1) end from received),
      'tasks_done', (select count(*) from tasks_done),
      'tasks_done_on_time', (select count(*) from tasks_done where due_at is null or completed_at <= due_at),
      'tasks_pending', (select count(*) from tasks_pending),
      'tasks_overdue', (select count(*) from tasks_pending where due_at < now())),
    'sellers', coalesce((select jsonb_agg(to_jsonb(s) order by s.won_value desc, s.won_count desc)
                           from sellers s
                          where s.user_id is not null
                             or s.leads_received + s.won_count + s.lost_count + s.tasks_done + s.tasks_pending > 0), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(to_jsonb(x) order by x.won_value desc, x.new_customers desc)
                           from sources x where x.new_customers > 0 or x.won_count > 0), '[]'::jsonb),
    'lost_reasons', coalesce((select jsonb_agg(jsonb_build_object('reason', reason, 'count', n, 'value', v) order by n desc)
                                from lost_reasons), '[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.report_data(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.report_data(uuid, timestamptz, timestamptz) to authenticated;
