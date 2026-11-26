# Etapa 5 — Equipo, suscripciones, panel de la plataforma y producción

## Qué se construyó

### Equipo (Configuración → Equipo)
- Invitaciones por enlace con rol (Administrador, Vendedor o Colaborador), con vencimiento de 7 días. El enlace se copia o se comparte por WhatsApp. CLIENTE360 no envía correos de invitación y no simula que lo hace.
- Pantalla `/invitacion/<token>`:
  - si la persona no tiene cuenta, la crea y vuelve a la invitación;
  - se valida que el correo coincida con el invitado;
  - a quien no corresponde, el correo se le muestra enmascarado.
- Cambiar roles, quitar miembros y salir de la empresa.
- Protecciones: siempre queda al menos un propietario, y solo un propietario nombra o quita propietarios.
- Límite de usuarios por plan, contando también las invitaciones pendientes.

### Plan y pagos (`/suscripcion`, propietario y administrador)
- Plan actual, estado, vencimiento y uso (usuarios, clientes y consultas de IA del mes).
- Comparación de planes con precios y límites de la base. No se ofrece un plan si el uso actual supera sus límites.
- **Solicitud de cambio de plan**: no cobra nada. El equipo de CLIENTE360 la aprueba cuando confirma el pago.
- Instrucciones de pago y contacto de soporte editables desde el panel.
- Historial de pagos confirmados.

### Panel de la plataforma (`/admin`, solo administradores de CLIENTE360)
- Resumen:
  - empresas, usuarios, suscripciones activas, en prueba y vencidas;
  - pruebas que terminan en 7 días;
  - ingreso mensual recurrente y monto cobrado en los últimos 30 días.
- Empresas: búsqueda por nombre o correo, plan, estado, vencimiento, usuarios, cantidad de clientes, última actividad y solicitudes pendientes.
- Detalle de empresa:
  - aprobar o rechazar solicitudes;
  - editar la suscripción;
  - **registrar pagos recibidos** (activan la suscripción y extienden el período desde el vencimiento vigente);
  - suspender con motivo y reactivar;
  - ver el equipo.
- Planes y precios editables: precio, usuarios, clientes, consultas de IA y visibilidad. Las suscripciones vigentes conservan el precio pactado.
- Ajustes: días y plan de la prueba gratis, instrucciones de pago y contacto de soporte.
- El panel **no muestra datos de los clientes de las empresas**, solo cantidades.
- Toda acción del panel queda auditada en el registro de actividad de la empresa.

### Pasarela de pagos
Queda preparado el contrato `PaymentGateway` (`src/lib/payments/types.ts`) y los pasos de integración en `docs/INTEGRACIONES.md`. No se implementó un proveedor concreto: sin credenciales de comercio sería una integración simulada.

## Seguridad (revisión de la etapa)
- **RLS en todas las tablas**, con más de 100 verificaciones automáticas de aislamiento y permisos (`npm run db:test`).
- **Separación de permisos**:
  - las acciones de la plataforma son funciones que verifican `is_platform_admin`;
  - una empresa no puede modificar su suscripción, sus pagos ni aprobar su propio plan (probado).
- **Secretos solo en el servidor**: la service_role key, la de IA y la de WhatsApp se leen en `server-env.ts`. Se verificó que no hay secretos con el prefijo `NEXT_PUBLIC_`.
- **Cabeceras de seguridad**:
  - Content-Security-Policy y `frame-ancestors 'none'`;
  - HSTS, `nosniff`, Referrer-Policy y Permissions-Policy;
  - sin cabecera `X-Powered-By`.
- **Dependencias**: `npm audit` sin vulnerabilidades (se fijaron versiones corregidas de `postcss` y `uuid`).
- **Webhooks y cron**: el webhook de WhatsApp verifica la firma HMAC de Meta y el cron exige `CRON_SECRET`.
- **Validación**: todas las entradas se validan con Zod en el servidor. Las exportaciones CSV neutralizan fórmulas.
- **Abuso**:
  - el cupo de IA se reserva de forma atómica;
  - hay un límite de 5 empresas por usuario;
  - los límites de plan se aplican en la base, no solo en la interfaz.

## Pruebas
- `supabase/tests/50_team_billing_admin.sql`:
  - límite de invitaciones;
  - normalización de correos e invitación de alguien que ya es miembro;
  - aceptación con otro correo;
  - permisos de vendedor;
  - solicitudes duplicadas e intento de autoaprobación;
  - estadísticas del panel;
  - pagos y extensión del período;
  - suspensión y reactivación;
  - auditoría;
  - visibilidad de los pagos.
- Totales: 5 archivos de pruebas SQL (todos pasan) y 40 pruebas unitarias.

## Entregables finales
| Entregable | Dónde |
|---|---|
| Software | Este repositorio |
| Migraciones | `supabase/migrations/` (7 archivos, en orden) |
| Instrucciones de instalación | `README.md` |
| Variables de entorno | `.env.example` |
| Guía de deploy en Vercel | `docs/DEPLOY.md` |
| Integraciones pendientes y credenciales | `docs/INTEGRACIONES.md` |
| Checklist de pruebas | `docs/CHECKLIST-PRUEBAS.md` |

## Pendientes que dependen de terceros
1. **Supabase**: crear el proyecto y cargar URL, anon key y service_role key.
2. **SMTP propio** en Supabase para los correos de confirmación y recuperación.
3. **ANTHROPIC_API_KEY**, para activar CLIENTE AI.
4. **App de Meta**, para WhatsApp por API oficial (v2). La versión manual ya funciona.
5. **Pasarela de pagos**: elegir proveedor y obtener credenciales de comercio.
6. **Dominio propio** (opcional).
