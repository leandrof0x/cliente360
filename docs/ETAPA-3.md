# Etapa 3 — WhatsApp, plantillas, agenda y automatizaciones

## Plantillas de mensajes (`/plantillas`)
- Crear, editar, copiar y eliminar plantillas, con categorías.
- Variables que se completan con datos reales: `{nombre}`, `{primer_nombre}`, `{empresa_cliente}`, `{negocio}`, `{vendedor}`, `{producto}`, `{valor}`. Si falta un dato, la variable se quita prolijamente.
- Botón "Agregar sugeridas": 6 plantillas de ejemplo (bienvenida, seguimiento, cotización, recordatorio, agradecimiento, reactivación) que el usuario agrega cuando quiere y puede editar.
- Permisos: Vendedores y superiores crean y editan; solo Propietario/Administrador eliminan.

## WhatsApp — versión 1 (funciona sin configurar nada)
En la ficha del cliente y de la oportunidad, botón **Mensaje**:
1. Elegir plantilla → se personaliza con los datos del cliente y de la oportunidad.
2. Editar el texto.
3. **Copiar** o **Abrir en WhatsApp** (wa.me con el texto cargado). El usuario envía desde su propio WhatsApp.
4. **Registrar envío**: queda en el historial del cliente como interacción saliente.
Nada se envía automáticamente.

## WhatsApp — versión 2 (preparada, se activa con credenciales de Meta)
- **Configuración → Canales de mensajería**: conectar un número con *Phone number ID* + token. Las credenciales se **verifican con la API de Meta** antes de guardarse; el token queda en `channel_secrets` (inaccesible desde el navegador).
- **Webhook** `POST /api/webhooks/whatsapp`: valida la firma `X-Hub-Signature-256`; asocia cada mensaje entrante al cliente por número normalizado; si el número no existe crea el cliente (fuente *WhatsApp*) y una **Nueva consulta** en el pipeline. Mensajes deduplicados por id de Meta. No registra datos en cuentas suspendidas o vencidas.
- **Autorización explícita**: aunque el número esté conectado, ninguna automatización puede enviar mensajes hasta que un Propietario/Administrador presione "Autorizo envíos automáticos". La base de datos impide activar una automatización de WhatsApp sin canal autorizado, y el servidor lo vuelve a comprobar antes de cada envío. Revocar la autorización o desconectar desactiva esas automatizaciones.
- El navegador nunca puede marcar un canal como "conectado": solo el servidor tras verificarlo.

## Agenda (`/agenda`)
- Vistas **día, semana y mes**, navegación y botón "Hoy". En celular, la vista mensual muestra un contador por día.
- Citas de tipo reunión, reserva, llamada, seguimiento u otro, con estado (programada, realizada, cancelada, no asistió), cliente, responsable, lugar y notas.
- Las tareas con fecha (seguimientos) aparecen en el mismo calendario.
- Al marcar una cita con cliente como **realizada**, se registra en su historial (una sola vez).

## Automatizaciones (`/automatizaciones`, Propietario/Administrador, desde plan Profesional)
Reglas "Cuando… entonces…":
- **Disparadores:** nueva consulta, cambio de estado de una oportunidad (a un estado elegido), cliente sin contacto hace N días (revisión diaria).
- **Acciones:** crear tarea (título con `{cliente}`/`{oportunidad}`, vencimiento en horas, prioridad), enviar datos a **n8n** por webhook HTTPS, enviar WhatsApp (solo con canal autorizado).
- Las tareas se crean dentro de la base (instantáneo y confiable). Los envíos externos pasan por una cola (`automation_outbox`) que el servidor entrega en segundo plano tras cada cambio, y diariamente por Vercel Cron (`/api/cron/automations`, protegido con `CRON_SECRET`), con hasta 5 reintentos.
- Registro de ejecuciones (OK / omitida / error) visible en la pantalla.
- Botón "Revisar clientes sin contacto ahora". No duplica tareas para el mismo cliente.
- El plan Inicial no incluye automatizaciones (lo impone la base de datos).

## Pruebas
- `npm run db:test`: suma `supabase/tests/30_automations.sql` (tarea automática con plantilla de título y vencimiento, cola n8n solo al estado correcto, automatización inactiva no corre, WhatsApp bloqueado sin canal, canal no puede marcarse conectado desde el cliente, URL sin https rechazada, programadas sin duplicados, aislamiento de cola y ejecuciones, plan Inicial sin automatizaciones). **Todo pasa.**
- `npm test`: 28 pruebas unitarias (se agrega calendario).
- Endpoints probados con el servidor de producción: verificación del webhook (token correcto/incorrecto), firma válida/ausente/incorrecta, cron sin/mal autorizado (401), rutas privadas redirigen al login.
- Revisión visual de agenda (mes, semana, celular), automatizaciones y plantillas.
