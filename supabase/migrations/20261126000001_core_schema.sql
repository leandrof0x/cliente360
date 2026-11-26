-- =====================================================================
-- CLIENTE360 · Esquema principal
-- Plataforma SaaS multiempresa. Todas las tablas con datos de negocio
-- llevan organization_id y se aíslan con RLS (ver migración 0002).
-- =====================================================================

-- Solo se usan funciones nativas de PostgreSQL (gen_random_uuid), sin extensiones.

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'seller', 'collaborator');
create type public.org_status as enum ('active', 'suspended');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'suspended', 'canceled');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type public.customer_status as enum ('nuevo', 'activo', 'inactivo');
create type public.lead_status as enum (
  'nueva', 'contactado', 'interesado', 'seguimiento', 'negociacion', 'ganado', 'perdido'
);
create type public.interaction_type as enum ('nota', 'llamada', 'whatsapp', 'email', 'reunion', 'visita', 'otro');
create type public.interaction_direction as enum ('entrante', 'saliente', 'interna');
create type public.task_type as enum ('seguimiento', 'llamada', 'tarea', 'reunion', 'administrativa');
create type public.task_status as enum ('pendiente', 'completada', 'cancelada');
create type public.task_priority as enum ('baja', 'media', 'alta');
create type public.appointment_type as enum ('reunion', 'reserva', 'llamada', 'seguimiento', 'otro');
create type public.appointment_status as enum ('programada', 'realizada', 'cancelada', 'no_asistio');
create type public.channel_type as enum ('whatsapp', 'email');
create type public.channel_status as enum ('desconectado', 'pendiente', 'conectado', 'error');

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Normaliza teléfonos para detectar duplicados: solo dígitos.
-- Un número paraguayo local 09xx se convierte a 5959xx.
create or replace function public.normalize_phone(p text)
returns text language sql immutable as $$
  select case
    when p is null then null
    when length(regexp_replace(p, '\D', '', 'g')) < 6 then null
    when regexp_replace(p, '\D', '', 'g') ~ '^0[0-9]{8,9}$'
      then '595' || substr(regexp_replace(p, '\D', '', 'g'), 2)
    else regexp_replace(p, '\D', '', 'g')
  end
$$;

-- ---------------------------------------------------------------------
-- Plataforma: planes y administradores de CLIENTE360
-- ---------------------------------------------------------------------
create table public.plans (
  id text primary key,                       -- 'inicial' | 'profesional' | 'negocio'
  name text not null,
  description text,
  price_gs integer not null check (price_gs >= 0),
  max_users integer not null check (max_users > 0),
  max_customers integer check (max_customers is null or max_customers > 0), -- null = ilimitado
  ai_monthly_requests integer not null default 0 check (ai_monthly_requests >= 0),
  features jsonb not null default '{}'::jsonb,  -- flags: {"automations":"basic","reports":true,...}
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- Administradores de la plataforma (panel general). Independiente de los roles de empresa.
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Configuración global editable (días de prueba, etc.)
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Usuarios y empresas
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique,
  phone text,
  email text,
  country char(2) not null default 'PY',
  currency char(3) not null default 'PYG',
  timezone text not null default 'America/Asuncion',
  status public.org_status not null default 'active',
  suspended_reason text,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'seller',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.org_role not null default 'seller' check (role <> 'owner'),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index organization_invitations_pending_uq
  on public.organization_invitations(organization_id, lower(email)) where accepted_at is null;

-- ---------------------------------------------------------------------
-- Suscripciones y pagos (sin cobros automáticos: se registran manualmente
-- o por una pasarela integrada a futuro vía webhook del servidor)
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  price_gs integer,                     -- precio pactado (copia del plan al contratar)
  provider text,                        -- pasarela futura (ej. 'bancard', 'pagopar')
  provider_ref text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id text references public.plans(id),
  amount_gs integer not null check (amount_gs >= 0),
  currency char(3) not null default 'PYG',
  status public.payment_status not null default 'pending',
  method text,                          -- transferencia, efectivo, pasarela...
  provider text,
  provider_ref text,
  period_start date,
  period_end date,
  paid_at timestamptz,
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index payments_org_idx on public.payments(organization_id, created_at desc);

-- ---------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  phone text,
  whatsapp text,
  email text,
  company text,
  customer_type text,                   -- ej. 'particular', 'empresa'
  source text,                          -- fuente de captación
  registered_at date not null default current_date,
  notes text,
  tags text[] not null default '{}',
  status public.customer_status not null default 'nuevo',
  assigned_to uuid references auth.users(id) on delete set null,
  last_contact_at timestamptz,
  phone_normalized text generated always as (public.normalize_phone(coalesce(whatsapp, phone))) stored,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create index customers_org_created_idx on public.customers(organization_id, created_at desc);
create index customers_org_status_idx on public.customers(organization_id, status);
create index customers_org_last_contact_idx on public.customers(organization_id, last_contact_at);
create index customers_tags_idx on public.customers using gin(tags);
create index customers_org_name_idx on public.customers(organization_id, lower(full_name));
-- Evitar duplicados por teléfono/WhatsApp o correo dentro de la misma empresa
create unique index customers_org_phone_uq on public.customers(organization_id, phone_normalized)
  where phone_normalized is not null;
create unique index customers_org_email_uq on public.customers(organization_id, lower(email))
  where email is not null;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200), -- descripción corta
  description text,
  product_service text,
  estimated_value numeric(14,0) not null default 0 check (estimated_value >= 0),
  entered_at date not null default current_date,
  assigned_to uuid references auth.users(id) on delete set null,
  status public.lead_status not null default 'nueva',
  position double precision not null default 0,   -- orden dentro de la columna Kanban
  next_action text,
  next_follow_up_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();
create index leads_org_status_idx on public.leads(organization_id, status, position);
create index leads_org_created_idx on public.leads(organization_id, created_at desc);
create index leads_org_won_idx on public.leads(organization_id, won_at) where won_at is not null;
create index leads_org_followup_idx on public.leads(organization_id, next_follow_up_at)
  where next_follow_up_at is not null;
create index leads_customer_idx on public.leads(customer_id);

-- Historial de cambios de estado (alimenta la conversión del pipeline)
create table public.lead_status_changes (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_status public.lead_status,
  to_status public.lead_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index lead_status_changes_lead_idx on public.lead_status_changes(lead_id, changed_at);
create index lead_status_changes_org_idx on public.lead_status_changes(organization_id, changed_at);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  type public.interaction_type not null default 'nota',
  direction public.interaction_direction not null default 'saliente',
  content text not null check (length(trim(content)) between 1 and 5000),
  occurred_at timestamptz not null default now(),
  channel_message_id text,              -- id externo (WhatsApp API) para la versión 2
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index interactions_customer_idx on public.interactions(customer_id, occurred_at desc);
create index interactions_org_idx on public.interactions(organization_id, occurred_at desc);
create unique index interactions_channel_msg_uq on public.interactions(organization_id, channel_message_id)
  where channel_message_id is not null;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  type public.task_type not null default 'seguimiento',
  priority public.task_priority not null default 'media',
  status public.task_status not null default 'pendiente',
  due_at timestamptz,
  customer_id uuid references public.customers(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  automation_id uuid,                   -- si fue creada por una automatización
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create index tasks_org_status_due_idx on public.tasks(organization_id, status, due_at);
create index tasks_assignee_idx on public.tasks(assigned_to, status, due_at);
create index tasks_customer_idx on public.tasks(customer_id);
create index tasks_lead_idx on public.tasks(lead_id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  type public.appointment_type not null default 'reunion',
  status public.appointment_status not null default 'programada',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  notes text,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();
create index appointments_org_starts_idx on public.appointments(organization_id, starts_at);

-- ---------------------------------------------------------------------
-- Mensajería, canales y automatizaciones
-- ---------------------------------------------------------------------
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  channel public.channel_type not null default 'whatsapp',
  category text,                        -- bienvenida, seguimiento, cotización...
  body text not null check (length(body) between 1 and 4000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
create trigger message_templates_updated_at before update on public.message_templates
  for each row execute function public.set_updated_at();

-- Canal autorizado por la empresa. Sin un canal 'conectado' y autorizado,
-- ninguna automatización puede enviar mensajes.
create table public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel public.channel_type not null,
  provider text not null,               -- 'whatsapp_cloud_api', 'smtp'...
  status public.channel_status not null default 'desconectado',
  display_name text,
  public_config jsonb not null default '{}'::jsonb,  -- datos NO secretos (phone_number_id, etc.)
  authorized_by uuid references auth.users(id) on delete set null,
  authorized_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, channel, provider)
);
create trigger channel_connections_updated_at before update on public.channel_connections
  for each row execute function public.set_updated_at();

-- Secretos de canales: RLS activado SIN políticas -> solo accesible con service_role
-- desde el servidor. Nunca se exponen al navegador.
create table public.channel_secrets (
  connection_id uuid primary key references public.channel_connections(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  secrets jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  trigger_type text not null,           -- 'lead_created', 'lead_status_changed', 'no_contact_days', 'schedule'
  trigger_config jsonb not null default '{}'::jsonb,
  action_type text not null,            -- 'create_task', 'notify_user', 'send_message', 'webhook_n8n'
  action_config jsonb not null default '{}'::jsonb,
  requires_channel public.channel_type, -- si la acción envía mensajes, qué canal necesita
  is_active boolean not null default false,
  last_run_at timestamptz,
  run_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger automations_updated_at before update on public.automations
  for each row execute function public.set_updated_at();
create index automations_org_idx on public.automations(organization_id, is_active);

create table public.automation_runs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  status text not null check (status in ('ok', 'skipped', 'error')),
  detail text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index automation_runs_automation_idx on public.automation_runs(automation_id, created_at desc);

-- ---------------------------------------------------------------------
-- IA y auditoría
-- ---------------------------------------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  feature text not null,                -- 'chat', 'draft_message', 'summary', 'report'
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_org_month_idx on public.ai_usage(organization_id, created_at desc);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_org_idx on public.activity_logs(organization_id, created_at desc);
create index activity_logs_entity_idx on public.activity_logs(entity_type, entity_id);
