-- =====================================================================
-- CLIENTE360 · Etapa 2: vistas del CRM
-- security_invoker = true -> las vistas respetan el RLS de quien consulta.
-- =====================================================================

create or replace view public.customer_overview
with (security_invoker = true) as
select
  c.*,
  coalesce(s.won_count, 0)::int       as won_count,
  coalesce(s.won_value, 0)::numeric   as won_value,
  coalesce(s.open_count, 0)::int      as open_leads,
  coalesce(s.won_count, 0) >= 2       as is_recurring,
  t.next_task_at
from public.customers c
left join lateral (
  select count(*) filter (where l.status = 'ganado') as won_count,
         sum(l.estimated_value) filter (where l.status = 'ganado') as won_value,
         count(*) filter (where l.status not in ('ganado', 'perdido')) as open_count
  from public.leads l where l.customer_id = c.id
) s on true
left join lateral (
  select min(due_at) as next_task_at from public.tasks tk
  where tk.customer_id = c.id and tk.status = 'pendiente'
) t on true;

grant select on public.customer_overview to authenticated;

-- Tareas: búsqueda frecuente por estado y fecha dentro de la empresa
create index if not exists tasks_org_completed_idx on public.tasks(organization_id, completed_at desc)
  where status = 'completada';

-- ---------------------------------------------------------------------
-- Recordatorios automáticos: cada oportunidad abierta con "próximo
-- seguimiento" tiene una tarea de seguimiento sincronizada. Si la
-- oportunidad se cierra, el recordatorio pendiente se cancela.
-- (Solo crea tareas internas: no envía mensajes a nadie.)
-- ---------------------------------------------------------------------
alter table public.tasks add column if not exists source text not null default 'manual'
  check (source in ('manual', 'lead_follow_up', 'automation'));
create unique index if not exists tasks_lead_followup_uq on public.tasks(lead_id)
  where source = 'lead_follow_up' and status = 'pendiente';

create or replace function public.sync_lead_follow_up_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cname text;
  ttitle text;
begin
  if new.status in ('ganado', 'perdido') or new.next_follow_up_at is null then
    update public.tasks set status = 'cancelada'
     where lead_id = new.id and source = 'lead_follow_up' and status = 'pendiente';
    return null;
  end if;

  if tg_op = 'UPDATE'
     and new.next_follow_up_at is not distinct from old.next_follow_up_at
     and new.next_action is not distinct from old.next_action
     and new.assigned_to is not distinct from old.assigned_to
     and old.status not in ('ganado', 'perdido') then
    return null;
  end if;

  select full_name into cname from public.customers where id = new.customer_id;
  ttitle := left(coalesce(nullif(trim(new.next_action), ''), 'Seguimiento') || ' · ' || coalesce(cname, new.title), 200);

  update public.tasks
     set due_at = new.next_follow_up_at, title = ttitle, assigned_to = new.assigned_to
   where lead_id = new.id and source = 'lead_follow_up' and status = 'pendiente';
  if not found then
    insert into public.tasks (organization_id, title, type, priority, due_at, customer_id, lead_id, assigned_to, source, created_by)
    values (new.organization_id, ttitle, 'seguimiento', 'media', new.next_follow_up_at, new.customer_id, new.id,
            new.assigned_to, 'lead_follow_up', auth.uid());
  end if;
  return null;
end $$;

create trigger leads_sync_follow_up after insert or update on public.leads
  for each row execute function public.sync_lead_follow_up_task();

-- Al completar el recordatorio, la fecha de seguimiento de la oportunidad se limpia
create or replace function public.clear_lead_follow_up_on_done()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'lead_follow_up' and new.status = 'completada' and old.status = 'pendiente' and new.lead_id is not null then
    update public.leads set next_follow_up_at = null
     where id = new.lead_id and next_follow_up_at is not distinct from new.due_at;
  end if;
  return null;
end $$;

create trigger tasks_clear_lead_follow_up after update of status on public.tasks
  for each row execute function public.clear_lead_follow_up_on_done();
