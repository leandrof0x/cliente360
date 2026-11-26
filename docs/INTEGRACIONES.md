# Integraciones y credenciales

| Integración | Estado | Qué se necesita |
|---|---|---|
| Supabase (base de datos y login) | Lista, falta conectar | Proyecto de Supabase: URL, anon key, service_role key |
| Vercel (hosting) | Lista | Importar el repo y cargar variables |
| Tareas programadas (Vercel Cron) | Lista | `CRON_SECRET` en Vercel (`vercel.json` ya define la ejecución diaria 08:00 PY) |
| n8n | Lista | Solo pegar la URL del webhook de n8n en una automatización |
| WhatsApp v1 (manual) | Funcionando | Nada |
| WhatsApp v2 (API oficial) | Preparada | App de Meta + variables de abajo |
| CLIENTE AI (Anthropic Claude) | Preparada | `ANTHROPIC_API_KEY` en Vercel (ver abajo) |
| Cobro de suscripciones | Funcionando (manual) | Instrucciones de pago en `/admin/ajustes`; los pagos se confirman en `/admin` |
| Pasarela de pagos (Paraguay) | Preparada (contrato) | Elegir proveedor y obtener credenciales (ver abajo) |
| Correo transaccional (SMTP) | Recomendado | SMTP propio en Supabase para confirmaciones y recuperación de contraseña |

## CLIENTE AI

Variables del servidor (nunca con prefijo `NEXT_PUBLIC_`):
- `ANTHROPIC_API_KEY`: clave de console.anthropic.com → Settings → API keys. Hay que cargar saldo o un medio de pago en la cuenta de Anthropic; el costo depende del uso.
- `AI_PROVIDER`: opcional, por defecto `anthropic`.
- `AI_MODEL`: opcional, por defecto `claude-opus-5-5`.

Sin la clave, CLIENTE AI muestra que falta configurarlo y no responde nada simulado. Cada consulta descuenta del cupo mensual del plan (Inicial 0, Profesional 200, Negocio 1000; editable en la tabla `plans`). Para cambiar de proveedor se implementa la interfaz `AIProvider` de `src/lib/ai/types.ts` y se registra en `src/lib/ai/index.ts`.

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

## Pasarela de pagos (Paraguay)

Hoy **no hay cobro en línea ni cobros simulados**: las empresas solicitan el plan, pagan por transferencia u otro medio, y el administrador registra el pago en `/admin`.

Para integrar una pasarela (por ejemplo Bancard vPOS o Pagopar):
1. Firmar con el proveedor y obtener las credenciales de comercio (clave pública/privada o token y URL del ambiente de pruebas y de producción).
2. Implementar el contrato `PaymentGateway` de `src/lib/payments/types.ts` siguiendo la documentación oficial del proveedor.
3. Crear el webhook `/api/webhooks/pagos/<proveedor>` que verifique la firma del aviso y registre el pago (equivalente a `platform_record_payment`).
4. Agregar las variables (ej. `PAYMENT_PROVIDER`, `PAYMENT_PUBLIC_KEY`, `PAYMENT_PRIVATE_KEY`) solo en el servidor.

Con esas credenciales, la integración es un trabajo acotado: el registro de pagos, la activación y la extensión de los períodos ya existen y están probados.

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
