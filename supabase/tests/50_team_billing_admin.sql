-- Pruebas de la etapa 5: equipo, solicitudes de plan y panel de la plataforma
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a5', 'olga@nueve.test'),
  ('00000000-0000-0000-0000-0000000000b5', 'pedro@nueve.test'),
  ('00000000-0000-0000-0000-0000000000c5', 'quim@otro.test'),
  ('00000000-0000-0000-0000-0000000000d5', 'admin@cliente360.test');
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000d5');
create table public._t5 (k text primary key, v text);
grant all on public._t5 to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false);
insert into public._t5 values ('org', public.create_organization('Nueve SRL')::text);

-- Invitaciones: el plan de prueba (Profesional) permite 3 usuarios contando invitaciones
insert into public.organization_invitations (organization_id, email, role)
select v::uuid, '  Pedro@Nueve.test ', 'seller' from public._t5 where k='org';
insert into public.organization_invitations (organization_id, email, role)
select v::uuid, 'rosa@nueve.test', 'collaborator' from public._t5 where k='org';
do $$ begin
  insert into public.organization_invitations (organization_id, email, role)
  select v::uuid, 'sol@nueve.test', 'seller' from public._t5 where k='org';
  raise exception 'FALLO: superó el límite de usuarios con invitaciones';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
end $$;
do $$ begin
  insert into public.organization_invitations (organization_id, email) select v::uuid, 'olga@nueve.test' from public._t5 where k='org';
  raise exception 'FALLO: invitó a alguien que ya es miembro';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
end $$;
do $$ begin
  if (select email from public.organization_invitations where email like 'pedro%') <> 'pedro@nueve.test' then
    raise exception 'FALLO: el correo no se normalizó'; end if;
  if (select invited_by from public.organization_invitations where email like 'pedro%') <> '00000000-0000-0000-0000-0000000000a5' then
    raise exception 'FALLO: invited_by'; end if;
end $$;
insert into public._t5 select 'tok', token from public.organization_invitations where email = 'pedro@nueve.test';

-- Otra persona ve la invitación con el correo enmascarado y no puede aceptarla
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ declare i jsonb; begin
  i := public.invitation_info((select v from public._t5 where k='tok'));
  if (i->>'email_matches')::boolean or i->>'email' <> 'p***@nueve.test' then raise exception 'FALLO: info de invitación %', i; end if;
  begin
    perform public.accept_invitation((select v from public._t5 where k='tok'));
    raise exception 'FALLO: aceptó una invitación de otro correo';
  exception when insufficient_privilege then null; end;
end $$;

-- La persona invitada la acepta
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b5', false);
do $$ declare i jsonb; begin
  i := public.invitation_info((select v from public._t5 where k='tok'));
  if not (i->>'email_matches')::boolean or i->>'organization' <> 'Nueve SRL' then raise exception 'FALLO: info %', i; end if;
  perform public.accept_invitation((select v from public._t5 where k='tok'));
  if public.org_role_of((select v::uuid from public._t5 where k='org')) <> 'seller' then raise exception 'FALLO: no quedó como vendedor'; end if;
  -- un vendedor no puede invitar ni pedir cambio de plan
  begin
    insert into public.organization_invitations (organization_id, email) select v::uuid, 'x@y.test' from public._t5 where k='org';
    raise exception 'FALLO: vendedor invitó';
  exception when insufficient_privilege then null; end;
  begin
    perform public.request_plan_change((select v::uuid from public._t5 where k='org'), 'negocio');
    raise exception 'FALLO: vendedor pidió cambio de plan';
  exception when insufficient_privilege then null; end;
end $$;

-- Solicitud de cambio de plan
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false);
insert into public._t5 select 'req', public.request_plan_change(v::uuid, 'negocio', 'Somos 5 vendedores')::text from public._t5 where k='org';
do $$ begin
  perform public.request_plan_change((select v::uuid from public._t5 where k='org'), 'inicial');
  raise exception 'FALLO: permitió dos solicitudes pendientes';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
end $$;
-- la empresa no puede aprobarse a sí misma ni tocar su suscripción o pagos
do $$ begin
  begin
    perform public.platform_resolve_plan_request((select v::uuid from public._t5 where k='req'), true);
    raise exception 'FALLO: la empresa aprobó su propio plan';
  exception when insufficient_privilege then null; end;
  update public.subscriptions set status = 'active', plan_id = 'negocio' where organization_id = (select v::uuid from public._t5 where k='org');
  if (select plan_id from public.subscriptions where organization_id = (select v::uuid from public._t5 where k='org')) <> 'profesional' then
    raise exception 'FALLO: la empresa cambió su suscripción'; end if;
  begin
    perform public.platform_stats();
    raise exception 'FALLO: usuario común vio estadísticas de la plataforma';
  exception when insufficient_privilege then null; end;
end $$;

-- Panel de la plataforma
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d5', false);
do $$ declare st jsonb; org uuid := (select v::uuid from public._t5 where k='org'); s public.subscriptions; n int; begin
  st := public.platform_stats();
  if (st->>'pending_plan_requests')::int < 1 then raise exception 'FALLO: stats %', st; end if;
  select count(*) into n from public.platform_organizations('nueve');
  if n <> 1 then raise exception 'FALLO: búsqueda de empresas devolvió %', n; end if;
  if (select members from public.platform_organizations('Nueve SRL')) <> 2 then raise exception 'FALLO: conteo de miembros'; end if;

  perform public.platform_resolve_plan_request((select v::uuid from public._t5 where k='req'), true, 'Pago recibido');
  select * into s from public.subscriptions where organization_id = org;
  if s.plan_id <> 'negocio' or s.price_gs <> 249000 then raise exception 'FALLO: no aplicó el plan aprobado'; end if;

  perform public.platform_record_payment(org, 498000, 2, 'Transferencia', 'OP-123');
  select * into s from public.subscriptions where organization_id = org;
  if s.status <> 'active' or s.current_period_end < now() + interval '58 days' or s.price_gs <> 249000 then
    raise exception 'FALLO: el pago no activó la suscripción (% %)', s.status, s.current_period_end; end if;
  if (select count(*) from public.payments where organization_id = org and status = 'paid') <> 1 then raise exception 'FALLO: pago no registrado'; end if;
  -- un segundo pago suma desde el vencimiento vigente
  perform public.platform_record_payment(org, 249000, 1, 'Efectivo');
  if (select current_period_end from public.subscriptions where organization_id = org) < s.current_period_end + interval '27 days' then
    raise exception 'FALLO: no extendió desde el vencimiento'; end if;
  begin
    perform public.platform_record_payment(org, 0, 1, 'Transferencia');
    raise exception 'FALLO: aceptó monto cero';
  exception when invalid_parameter_value then null; end;

  perform public.platform_set_org_status(org, 'suspended', 'Falta de pago');
  if public.org_is_writable(org) then raise exception 'FALLO: suspendida pero editable'; end if;
  perform public.platform_set_org_status(org, 'active');
  if not public.org_is_writable(org) then raise exception 'FALLO: reactivada pero no editable'; end if;
  -- el administrador de la plataforma no ve el detalle de actividad de las empresas
  if exists (select 1 from public.activity_logs where organization_id = org) then
    raise exception 'FALLO: admin de plataforma lee actividad de la empresa'; end if;
end $$;

-- La empresa ve sus pagos, pero un vendedor no
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false);
do $$ begin
  if (select count(*) from public.payments) <> 2 then raise exception 'FALLO: el propietario no ve sus pagos'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b5', false);
do $$ begin
  if exists (select 1 from public.payments) then raise exception 'FALLO: vendedor ve pagos'; end if;
end $$;

reset role;
do $$ begin
  if (select count(*) from public.activity_logs where organization_id = (select v::uuid from public._t5 where k='org') and entity_type = 'subscription') < 5 then
    raise exception 'FALLO: acciones de plataforma sin auditoría'; end if;
end $$;
drop table public._t5;
select 'Equipo, planes y panel de plataforma: todas las pruebas pasaron';
