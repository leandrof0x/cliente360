# Etapa 1 — Base del producto

## Qué se implementó

### Proyecto y diseño
- Next.js 15 + TypeScript estricto + Tailwind 4, tipografía Inter (auto-hospedada, sin depender de Google Fonts), iconos Lucide.
- Identidad: fondo gris muy claro, sidebar oscuro, azul eléctrico como color principal, verde para indicadores positivos, tarjetas con bordes suaves.
- Layout responsive: sidebar fijo en escritorio, menú deslizable en celulares.
- Solo se muestran en el menú los módulos que ya funcionan (sin botones decorativos).

### Autenticación (Supabase Auth)
- Registro con nombre, correo y contraseña (mín. 8). Confirmación por correo compatible.
- Ingreso, cierre de sesión, recuperación y cambio de contraseña.
- Middleware que valida la sesión en cada request y protege el área privada.
- Protección contra redirecciones abiertas y mensajes que no revelan si un correo existe.
- Si faltan las variables de Supabase, la app muestra una pantalla de "configuración pendiente" en vez de simular un backend.

### Multiempresa
- Alta de empresa en el onboarding (`create_organization`): crea la empresa, al usuario como **Propietario** y una **prueba gratis de 14 días** del plan Profesional (configurable en `platform_settings`).
- Un usuario puede pertenecer a varias empresas y cambiar la empresa activa desde el sidebar. La empresa activa se guarda en una cookie, pero siempre se valida contra sus membresías reales.
- Roles: Propietario, Administrador, Vendedor, Colaborador.

### Base de datos (`supabase/migrations/`)
Tablas: `profiles`, `organizations`, `organization_members`, `organization_invitations`, `plans`, `platform_admins`, `platform_settings`, `subscriptions`, `payments`, `customers`, `leads`, `lead_status_changes`, `interactions`, `tasks`, `appointments`, `message_templates`, `channel_connections`, `channel_secrets`, `automations`, `automation_runs`, `ai_usage`, `activity_logs`.

Se diseñó el esquema completo desde ahora para que las etapas siguientes no requieran rehacer la base.

**Seguridad implementada en la base (no solo en la interfaz):**
- RLS en todas las tablas. Cada negocio solo ve y modifica sus datos.
- Las referencias (cliente, oportunidad, responsable) se validan dentro de la misma empresa; un registro no puede moverse a otra empresa.
- `created_by` lo fija la base: no se puede falsificar la autoría.
- Empresas suspendidas o con prueba/suscripción vencida quedan en **solo lectura** (los datos se conservan).
- Límites por plan aplicados con triggers: cantidad de clientes y de usuarios.
- Siempre queda al menos un propietario; solo un propietario modifica a otro propietario.
- Solo el administrador de la plataforma cambia el estado de una cuenta, la suscripción o los pagos.
- El administrador de la plataforma **no** lee clientes ni actividad de las empresas (privacidad).
- `channel_secrets` (tokens de WhatsApp, etc.) no es accesible desde el navegador: RLS sin políticas, solo `service_role` en el servidor.
- Duplicados de clientes bloqueados por teléfono/WhatsApp normalizado (`0981 123 456` = `+595 981 123456`) y por correo sin distinguir mayúsculas.
- Auditoría automática en `activity_logs` y historial de estados de oportunidades en `lead_status_changes`.

### Dashboard
Todos los indicadores salen de la función `dashboard_data` (SECURITY INVOKER: respeta RLS):
- Clientes totales, nuevos del período, consultas recibidas, oportunidades abiertas (y valor), ventas concretadas (cantidad y valor), tasa de conversión, seguimientos pendientes (vencidos / de hoy), clientes sin respuesta (oportunidad abierta y +7 días sin contacto).
- **Bloque "Para atender hoy"** al inicio: tareas vencidas y de hoy (se pueden marcar como hechas), consultas sin responder y seguimientos de oportunidades vencidos.
- Gráficos: evolución de clientes, ventas por período, conversión por etapa del pipeline y distribución de oportunidades por estado.
- Filtro por fecha: 7/30/90 días, este mes, este año o rango personalizado. Agrupación automática por día, semana o mes, en hora de Paraguay.
- Actividad comercial reciente.

### Configuración
- Datos del negocio (editables por Propietario/Administrador), equipo con roles, perfil, estado de la suscripción, uso de clientes contra el límite y planes vigentes desde la base.

## Pruebas ejecutadas
- `npm run db:test`: aplica las 3 migraciones en PostgreSQL 16 y ejecuta `supabase/tests/10_rls_multitenant.sql` — **todas pasan**. Cubre: aislamiento entre empresas (lectura, edición, borrado, inserción, dashboard), referencias cruzadas, cambio de empresa, auto-asignación a otra empresa, manipulación de suscripción/estado, secretos, escalada a admin, último propietario, permisos de Vendedor y Colaborador, admin de plataforma sin acceso a clientes, bloqueo por suspensión y prueba vencida, límites de usuarios y clientes, duplicados, historial y dashboard.
- `npm test`: 15 pruebas unitarias (rangos de fecha en hora de Paraguay, validaciones, redirecciones seguras, formato de guaraníes, mensajes de error).
- `npm run typecheck`, `npm run lint`, `npm run build`: sin errores.
- Revisión visual en escritorio (1440px) y celular (390px).

## Pendiente de verificar con Supabase real
El flujo completo registro → confirmación → onboarding → dashboard requiere un proyecto de Supabase. Se verificará apenas estén cargadas las credenciales (ver README).
