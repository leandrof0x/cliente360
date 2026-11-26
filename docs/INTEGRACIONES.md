# Integraciones y credenciales

| Integración | Estado | Qué se necesita |
|---|---|---|
| Supabase (base de datos y login) | Lista, falta conectar | Proyecto de Supabase: URL, anon key, service_role key |
| Vercel (hosting) | Lista | Importar el repo y cargar variables |
| Tareas programadas (Vercel Cron) | Lista | `CRON_SECRET` en Vercel (`vercel.json` ya define la ejecución diaria 08:00 PY) |
| n8n | Lista | Solo pegar la URL del webhook de n8n en una automatización |
| WhatsApp v1 (manual) | Funcionando | Nada |
| WhatsApp v2 (API oficial) | Preparada | App de Meta + variables de abajo |
| CLIENTE AI | Etapa 4 | — |
| Pasarela de pagos (Paraguay) | Etapa 5 | — |

## WhatsApp Business Platform (API oficial)

Variables del servidor (Vercel → Environment Variables):
- `WHATSAPP_VERIFY_TOKEN`: texto aleatorio que vos elegís; se pega también en Meta al configurar el webhook.
- `WHATSAPP_APP_SECRET`: *App Secret* de la app de Meta (Configuración → Básica). Sirve para validar la firma de cada webhook.
- `WHATSAPP_GRAPH_VERSION`: opcional (por defecto `v21.0`).

Pasos:
1. En developers.facebook.com crear una app tipo **Business** y agregar el producto **WhatsApp**.
2. Registrar el número del negocio (o usar el número de prueba).
3. Crear un **usuario del sistema** en el Business Manager y generar un **token permanente** con permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
4. En WhatsApp → Configuración → Webhook: URL `https://TU-DOMINIO/api/webhooks/whatsapp`, token de verificación = `WHATSAPP_VERIFY_TOKEN`. Suscribirse al campo **messages**.
5. En CLIENTE360 → Configuración → Canales: pegar *Phone number ID* y token. Se verifican con Meta.
6. (Opcional) Autorizar envíos automáticos.

Notas de Meta: para iniciar conversación o escribir pasadas 24 h del último mensaje del cliente, Meta exige **plantillas aprobadas**; el envío de texto libre funciona dentro de esa ventana. Las conversaciones tienen costo según la tarifa de Meta para Paraguay.

## n8n
En una automatización elegir "Enviar los datos a n8n" y pegar la URL de un nodo **Webhook** (método POST). El cuerpo enviado:

```json
{
  "event": "lead_status_changed",
  "automation": "Avisar a n8n al ganar",
  "organization_id": "…",
  "created_at": "…",
  "data": { "lead_id": "…", "lead_title": "…", "status": "ganado", "previous_status": "negociacion",
            "estimated_value": 1500000, "customer_id": "…", "customer_name": "…",
            "customer_phone": "…", "customer_email": "…", "assigned_to": "…" }
}
```
