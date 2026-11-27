-- =====================================================================
-- CLIENTE360 · Permisos de la API de datos
-- Los proyectos nuevos de Supabase ya no dan permisos automáticos sobre
-- las tablas del esquema public. Sin esto, la app no puede leer ni
-- escribir nada aunque las políticas RLS lo permitan.
-- La seguridad la siguen dando las políticas RLS de cada tabla.
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Usuarios con sesión: operan sobre sus datos, filtrados por RLS
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Servidor (webhooks, automatizaciones, cron): ignora RLS por diseño
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Visitantes sin sesión: solo ven los planes de la página de precios
grant select on public.plans to anon;

-- Tablas y secuencias que se creen en el futuro con este mismo usuario
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

notify pgrst, 'reload schema';
