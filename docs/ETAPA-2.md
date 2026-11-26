# Etapa 2 — CRM, pipeline, seguimientos y tareas

## Clientes (`/clientes`)
- Alta y edición con validación: nombre (obligatorio), WhatsApp, teléfono, correo, empresa, tipo, fuente de captación, fecha de registro, estado, responsable, etiquetas y observaciones.
- **Evita duplicados:** antes de guardar busca otro cliente con el mismo teléfono/WhatsApp (normalizado: `0981 123 456` = `+595 981 123456`) o correo, y ofrece abrir el existente. La base de datos también lo impide con índices únicos.
- Búsqueda por nombre, teléfono, correo o empresa. Filtros por estado, tipo, fuente, etiqueta y clientes recurrentes. Paginación de 25.
- Tabla en escritorio y tarjetas en celular, con acceso directo a WhatsApp.
- Eliminación con confirmación, solo para Propietario y Administrador.

## Ficha del cliente (`/clientes/[id]`)
- Datos completos, etiquetas clicables (filtran la lista), botón de WhatsApp (abre wa.me; no envía nada solo).
- **Historial de interacciones:** llamadas, WhatsApp, correo, reunión, visita y notas internas, indicando si el cliente nos contactó o lo contactamos, con fecha, autor y oportunidad relacionada. Registrar un contacto actualiza el "último contacto" y pasa al cliente de *Nuevo* a *Activo*.
- **Cliente recurrente:** se marca automáticamente con 2 o más ventas concretadas; se muestra la cantidad y el total comprado.
- Oportunidades del cliente y sus tareas, con alta rápida.

## Pipeline comercial (`/pipeline`)
- Kanban con los 7 estados: Nueva consulta, Contactado, Interesado, Seguimiento pendiente, Negociación, Venta concretada, Perdido.
- **Arrastrar y soltar** entre columnas y dentro de una columna (orden persistente). En celular, cada tarjeta tiene un selector "Mover a".
- Al pasar a *Perdido* pide el motivo (opcional). Ganadas/perdidas muestran los últimos 30 días.
- Totales por columna, filtro *Todas / Mías*, seguimientos vencidos en rojo.
- Ficha de oportunidad (`/pipeline/[id]`): cliente, descripción, producto/servicio, valor estimado, fecha de ingreso, responsable, estado, próxima acción y fecha del próximo seguimiento. **Historial de cambios de estado** con fecha y usuario.

## Seguimientos y tareas (`/seguimientos`)
- Vistas: **Vencidas**, Hoy, Próximas, Sin fecha, Completadas y **Sin contacto** (clientes sin contacto hace 3/7/15/30 días, priorizando los que tienen oportunidades abiertas).
- Programar tareas con tipo (seguimiento, llamada, tarea, reunión, administrativa), prioridad, fecha y hora, cliente y responsable. Completar, reabrir y eliminar.
- **Recordatorios automáticos:** al poner "próximo seguimiento" en una oportunidad se crea (o reprograma) una tarea de seguimiento; al completarla se limpia la fecha; si la oportunidad se gana o pierde, el recordatorio pendiente se cancela. Son solo tareas internas: no se envía ningún mensaje.

## Dashboard
- Enlaces directos desde "Para atender hoy" a la ficha del cliente y de la oportunidad, y acceso a todos los seguimientos.

## Base de datos
- Migración `20261126000004_crm_views.sql`: vista `customer_overview` (con `security_invoker`, respeta RLS), columna `tasks.source` y triggers de recordatorios automáticos.

## Pruebas
- `npm run db:test`: suma `supabase/tests/20_crm.sql` (recurrentes, recordatorio automático: creación, reprogramación sin duplicar, limpieza al completar, cancelación al perder, aislamiento de la vista). **Todo pasa.**
- `npm test`: 24 pruebas unitarias (se agregan teléfonos, WhatsApp, fechas en hora de Paraguay, búsqueda segura, validaciones de cliente y oportunidad).
- Typecheck, lint y build sin errores.
- Revisión visual del Kanban, tareas e historial en escritorio y celular; prueba automatizada de arrastrar y soltar.
