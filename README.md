# CLIENTE360

> Deja de perder clientes por falta de seguimiento. CLIENTE360 organiza tu negocio y te ayuda a convertir más consultas en ventas.

SaaS multiempresa de gestión de clientes, ventas y seguimientos para pequeños y medianos negocios.

**Stack:** Next.js 15 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL, Auth, RLS) · Recharts · Lucide · Vercel.

## Estado

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Proyecto, diseño, autenticación, multiempresa, base de datos, dashboard | ✅ Completa — ver [docs/ETAPA-1.md](docs/ETAPA-1.md) |
| 2 | CRM, clientes, pipeline, seguimientos, tareas | ✅ Completa — ver [docs/ETAPA-2.md](docs/ETAPA-2.md) |
| 3 | WhatsApp, plantillas, agenda, automatizaciones | En curso |
| 4 | CLIENTE AI, reportes, exportaciones | Pendiente |
| 5 | Suscripciones, panel administrador, seguridad, producción | Pendiente |

## Instalación local

Requisitos: Node.js 20+ y un proyecto de Supabase (plan gratuito).

```bash
npm install
cp .env.example .env.local   # completar con los datos de Supabase
npm run dev                  # http://localhost:3000
```

### Base de datos

Las migraciones están en `supabase/migrations/` y se aplican en orden:

- **Opción A (Supabase CLI):** `npx supabase link --project-ref TU_REF` y luego `npx supabase db push`.
- **Opción B (manual):** en Supabase → SQL Editor, ejecutar cada archivo de `supabase/migrations/` en orden.

### Autenticación (Supabase → Authentication → URL Configuration)

- **Site URL:** la URL de la app (ej. `https://cliente360.vercel.app`).
- **Redirect URLs:** `https://TU-DOMINIO/auth/callback` y `http://localhost:3000/auth/callback`.
- Proveedor *Email* activado. Se recomienda dejar activa la confirmación de correo.

### Administrador de la plataforma

El panel general de CLIENTE360 (etapa 5) usa la tabla `platform_admins`, independiente de los roles de las empresas. Para darte acceso, después de registrarte ejecutá en el SQL Editor:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'tu-correo@ejemplo.com';
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run check` | TypeScript + ESLint + pruebas unitarias |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run db:test` | Aplica las migraciones en un PostgreSQL local y ejecuta las pruebas de seguridad RLS (requiere `psql` con acceso a un servidor local) |

## Despliegue en Vercel

1. Importar el repositorio en Vercel (framework: Next.js, sin cambios de build).
2. Cargar las variables de `.env.example` en *Settings → Environment Variables*. `SUPABASE_SERVICE_ROLE_KEY` solo en el servidor (nunca con prefijo `NEXT_PUBLIC_`).
3. Poner `NEXT_PUBLIC_SITE_URL` con el dominio final y agregar `https://DOMINIO/auth/callback` en las Redirect URLs de Supabase.
4. Deploy.

## Estructura

```
src/
  app/
    (auth)/          ingresar, registro, recuperar
    (app)/           área privada: dashboard, configuración…
    actions/         Server Actions (validadas con Zod, ejecutadas con la sesión del usuario)
    auth/            callbacks de Supabase Auth
  components/        UI y módulos
  lib/               supabase, sesión/empresa activa, validaciones, utilidades
supabase/
  migrations/        esquema, RLS, funciones
  tests/             pruebas de aislamiento multiempresa (SQL)
docs/                documentación por etapa
```
