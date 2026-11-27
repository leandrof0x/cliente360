# Guía de puesta en producción (Supabase + Vercel)

Tiempo estimado: 30 a 45 minutos. Todo funciona en los planes gratuitos de Supabase y Vercel para empezar.

## 1. Supabase (base de datos y login)

1. Crear un proyecto en https://supabase.com. Región sugerida: **São Paulo (sa-east-1)**, la más cercana a Paraguay. Guardá la contraseña de la base.
2. **Aplicar las migraciones** en orden (las 8 de `supabase/migrations/`):
   - Opción A, con la CLI: `npx supabase link --project-ref TU_REF` y después `npx supabase db push`.
   - Opción B, manual: en *SQL Editor*, ejecutar cada archivo en orden (`…000001` a `…000007`).
3. *Authentication → URL Configuration*:
   - **Site URL**: `https://TU-DOMINIO` (o la URL de Vercel).
   - **Redirect URLs**: `https://TU-DOMINIO/auth/callback` y, para desarrollo, `http://localhost:3000/auth/callback`.
4. *Authentication → Providers → Email*: activado, con la confirmación de correo activada.
5. **Correo (SMTP)**: Supabase incluye un servidor de correo de prueba con límite bajo (unos pocos correos por hora). Para producción hay que configurar un SMTP propio en *Authentication → SMTP Settings* (por ejemplo Resend, Brevo o el correo del dominio). Así llegan bien las confirmaciones de cuenta y la recuperación de contraseña.
6. (Opcional) Traducir las plantillas de correo en *Authentication → Email Templates*.
7. *Project Settings → API*: copiar **Project URL**, **anon public key** y **service_role key**. La service_role key va solo al servidor.

## 2. Vercel (hosting)

1. Importar el repositorio de GitHub en https://vercel.com/new. Framework: Next.js, sin cambios.
2. *Settings → Environment Variables* (Production y Preview):

| Variable | Obligatoria | Valor |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Project URL de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí* | service_role key (solo servidor) |
| `NEXT_PUBLIC_SITE_URL` | Sí | `https://TU-DOMINIO` |
| `CRON_SECRET` | Sí | Texto aleatorio largo (ej. `openssl rand -hex 32`) |
| `ANTHROPIC_API_KEY` | Para CLIENTE AI | Clave de console.anthropic.com |
| `AI_MODEL` | No | Por defecto `claude-opus-5-5` |
| `WHATSAPP_VERIFY_TOKEN` | Para WhatsApp API | Texto aleatorio que también se pega en Meta |
| `WHATSAPP_APP_SECRET` | Para WhatsApp API | App Secret de la app de Meta |
| `WHATSAPP_GRAPH_VERSION` | No | `v21.0` |

\* La service_role key hace falta para las automatizaciones programadas, el webhook de WhatsApp y la conexión del canal. El resto de la app funciona con la sesión de cada persona.

3. **Deploy**. La tarea diaria (`vercel.json`, 08:00 hora de Paraguay) ejecuta las automatizaciones programadas. Vercel le envía `CRON_SECRET` automáticamente.
4. **Dominio propio** (opcional): en *Settings → Domains*. Después actualizá `NEXT_PUBLIC_SITE_URL` y las URLs de Supabase.

## 3. Primer acceso

1. Entrar a `https://TU-DOMINIO/registro`, crear la cuenta y confirmar el correo.
2. Darte acceso al panel de la plataforma, en el *SQL Editor*:
   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users where email = 'tu-correo@ejemplo.com';
   ```
3. En `/admin/ajustes`: cargar las **instrucciones de pago** (banco, titular, RUC, cuenta) y el **contacto de soporte**. Revisar los días de prueba gratis.
4. En `/admin/planes`: confirmar los precios (79.000 / 149.000 / 249.000 Gs.) y los límites.

## 4. Cómo se cobra hoy (sin pasarela)

1. La empresa elige un plan en **Plan y pagos**. Se crea una solicitud y no se cobra nada.
2. La empresa paga por transferencia u otro medio, con las instrucciones que cargaste.
3. En `/admin`, abrís la empresa, **aprobás la solicitud** y **registrás el pago recibido**. La suscripción queda activa y el período se extiende.
4. Si una suscripción vence, la cuenta pasa a **solo lectura** (los datos no se pierden). Hay 3 días de gracia para las activas y 7 días para las que tienen el pago atrasado.

## 5. Copias de seguridad
- El plan gratuito de Supabase no incluye backups automáticos descargables. Para producción se recomienda el plan Pro (backups diarios) o un `pg_dump` periódico.
- Las exportaciones a Excel desde **Reportes** sirven como respaldo para cada empresa.

## 6. Verificación después del deploy
Seguir [CHECKLIST-PRUEBAS.md](CHECKLIST-PRUEBAS.md).
