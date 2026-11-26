# Checklist de pruebas (antes de vender)

Probar en producción con dos navegadores (o uno normal y uno en modo incógnito) y **dos cuentas distintas**. Marcar cada punto.

## Cuenta y acceso
- [ ] Registro: llega el correo de confirmación y el enlace lleva a "Contanos sobre tu negocio".
- [ ] Crear la empresa: aparece el aviso de prueba gratis con los días correctos.
- [ ] Cerrar sesión e ingresar de nuevo. Una contraseña incorrecta muestra un error claro.
- [ ] "Olvidé mi contraseña": llega el correo y permite crear una nueva.
- [ ] Sin sesión, `/dashboard` redirige a ingresar.

## Aislamiento entre empresas (crítico)
- [ ] La cuenta B crea su propia empresa y **no ve** clientes, oportunidades, tareas ni reportes de A.
- [ ] Copiar en B la URL de un cliente de A (`/clientes/ID`): debe responder "no encontrado".

## CRM y pipeline
- [ ] Crear un cliente. Al cargar un teléfono duplicado avisa que ya existe.
- [ ] Registrar una interacción (llamada o nota): aparece en el historial.
- [ ] Crear una oportunidad con próximo seguimiento: se genera la tarea automática.
- [ ] Arrastrar la oportunidad por las 7 columnas del Kanban: queda el historial de estados.
- [ ] Marcarla como perdida con un motivo: aparece en Reportes → Motivos de pérdida.

## Seguimientos y agenda
- [ ] Una tarea vencida aparece destacada en el Dashboard.
- [ ] Completar y reabrir una tarea.
- [ ] Crear una cita y verla en las vistas de día, semana y mes.

## WhatsApp v1
- [ ] Desde un cliente: "Mensaje", elegir una plantilla, "Abrir en WhatsApp" (abre wa.me con el texto) y "Registrar envío".

## Automatizaciones (plan Profesional o Negocio)
- [ ] La regla "al crear una oportunidad, crear una tarea" crea la tarea.
- [ ] Una regla de WhatsApp **no se puede activar** sin el canal conectado y autorizado.
- [ ] Cron: `curl -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/cron/automations` responde 200, y sin la clave responde 401.

## Equipo
- [ ] Invitar a la cuenta B como Vendedor, copiar el enlace y abrirlo con B. Se suma a la empresa de A.
- [ ] B (vendedor) no ve Reportes, Automatizaciones ni Plan y pagos, y no puede invitar.
- [ ] Al llegar al límite del plan, la invitación se bloquea.
- [ ] El propietario cambia el rol de B y después lo quita del equipo.

## CLIENTE AI (con `ANTHROPIC_API_KEY`)
- [ ] Sin la clave: la pantalla indica qué falta y no muestra respuestas.
- [ ] Resumen de un cliente con historial: menciona solo datos reales del cliente.
- [ ] Al preguntar por un dato que no existe (ej. "¿cuánto vendimos en 2019?"), responde que no está registrado.
- [ ] Al redactar una respuesta, el borrador se puede editar, copiar y abrir en WhatsApp.
- [ ] El contador de consultas del mes aumenta.

## Reportes y exportación
- [ ] Los números de Reportes coinciden con los datos cargados (contar a mano en una empresa de prueba).
- [ ] Descargar Excel y CSV de cada tipo: abren bien en Excel con tildes y montos.

## Plan y pagos / panel de la plataforma
- [ ] La empresa solicita el plan Negocio y la solicitud aparece en `/admin`.
- [ ] En `/admin`: aprobar, registrar el pago y verificar que el estado pasa a Activa y la fecha de vencimiento se actualiza.
- [ ] Suspender la cuenta con un motivo: la empresa ve el aviso y no puede modificar datos. Reactivarla.
- [ ] Una cuenta que no es administradora entra a `/admin` y recibe "no encontrado".
- [ ] Cambiar el precio de un plan en `/admin/planes`: se ve en "Plan y pagos".

## Móvil
- [ ] Recorrer el Dashboard, Clientes, el Pipeline (scroll horizontal), Agenda y CLIENTE AI en un celular.
