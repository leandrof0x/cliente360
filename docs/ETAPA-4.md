# Etapa 4 — CLIENTE AI, reportes y exportación

## Qué se construyó

### CLIENTE AI (`/asistente` y fichas)
- **Consulta libre** (`/asistente`): preguntas sobre clientes, oportunidades, tareas y ventas. Mantiene la conversación de la sesión.
- **Acciones rápidas**:
  - *Oportunidades sin seguimiento*: prioriza las abiertas sin seguimiento, vencidas o quietas hace 7 días o más.
  - *Reporte comercial* y *Mejorar la conversión* (solo propietario/administrador), con período elegible.
- **En la ficha del cliente**: *Resumen del cliente* y *Redactar respuesta* (opcionalmente pegando el último mensaje recibido).
- **En la ficha de la oportunidad**: *Analizar oportunidad* (diagnóstico y próximos pasos) y *Mensaje de seguimiento*.
- Los borradores se pueden editar, copiar, abrir en WhatsApp y registrar como enviados. **Nada se envía automáticamente.**
- Tono elegible para mensajes: cercano (vos) o formal (usted).

### Reportes (`/reportes`, solo propietario/administrador)
- Clientes nuevos y recurrentes (recurrente = compró en el período y ya tenía otra venta ganada).
- Consultas recibidas y mensajes entrantes registrados.
- Ventas ganadas (cantidad, monto, ticket promedio), oportunidades perdidas y monto perdido.
- Tasa de cierre (ganadas sobre cerradas) y conversión de consultas del período.
- Seguimientos realizados (y a tiempo), pendientes y vencidos.
- Ventas en el tiempo, rendimiento por vendedor, fuentes de clientes y motivos de pérdida.
- Filtro de fechas igual al del dashboard (7, 30 o 90 días, este mes, este año, personalizado).

### Exportación (`/api/exportar`)
- **Excel (.xlsx)** con encabezados, filtros, formato de miles y una hoja por sección del reporte.
- **CSV** compatible con Excel en español (separador `;`, UTF-8 con BOM).
- Datos disponibles: el reporte del período, clientes (todos), oportunidades del período, y seguimientos y tareas del período.
- Solo propietario/administrador y planes con exportación (Profesional y Negocio).
- Protección contra inyección de fórmulas en CSV.

## Cómo respeta las reglas
- **Datos reales, nunca inventados.** El asistente recibe solo datos consultados en ese momento con la sesión de la persona (RLS). Las instrucciones le prohíben inventar cifras y le piden decir qué falta. Si no hay clave configurada, la pantalla lo dice y no se simula ninguna respuesta.
- **Permisos.**
  - Vendedores y colaboradores ven en el asistente solo sus oportunidades y tareas (y las sin asignar).
  - Reportes, recomendaciones de conversión y exportaciones son solo para propietario/administrador. La base lo vuelve a verificar en `report_data`.
- **Privacidad.** Al proveedor de IA no se envían teléfonos ni correos, solo lo necesario para la tarea. Las notas y mensajes de clientes se marcan como datos y no como instrucciones, para evitar manipulaciones.
- **Secretos.** `ANTHROPIC_API_KEY` solo se usa en el servidor.
- **Cupo por plan.**
  - `ai_reserve_request` reserva la consulta de forma atómica (con bloqueo por empresa) antes de llamar al proveedor.
  - `ai_complete_request` registra el consumo real (modelo y tokens) en `ai_usage`.
  - Si el proveedor falla, `ai_release_request` devuelve el cupo.
  - El mes se cuenta en hora de Paraguay.
  - El navegador no puede escribir en `ai_usage` directamente.

## Proveedor de IA desacoplado
- Interfaz `AIProvider` en `src/lib/ai/types.ts`. Implementación actual: Anthropic Claude (`src/lib/ai/anthropic.ts`), modelo `claude-opus-5-5`, cambiable con `AI_MODEL`.
- Esfuerzo bajo para borradores y medio para análisis. La API puede usar un modelo de respaldo si el principal está saturado.
- Errores traducidos al español: clave inválida, límite del proveedor, saturación, demora, o negativa del modelo.

## Base de datos
Migración `20261126000006_ai_reports.sql`:
- Funciones de cupo: `ai_quota`, `ai_reserve_request`, `ai_complete_request` y `ai_release_request`.
- `report_data(org, desde, hasta)`: SECURITY INVOKER, con verificación de rol y de plan.

## Pruebas
- `npm run db:test`: suma `supabase/tests/40_ai_reports.sql`, que prueba:
  - cupo, límite y liberación;
  - reservas ajenas;
  - que no se pueda insertar uso directo;
  - que un vendedor no vea el reporte y que otra empresa no acceda;
  - los cálculos del reporte con datos cargados en la prueba (recurrentes, conversión, vendedor, motivos).
- `npm test`: 40 pruebas unitarias. Las nuevas cubren las instrucciones de la IA, el proveedor Anthropic (con transporte simulado: modelo, esfuerzo, respaldo, negativas, errores, respuestas cortadas) y el CSV.
- Revisión visual (escritorio y móvil) del asistente y del panel de IA.

## Qué necesitás configurar
1. `ANTHROPIC_API_KEY` en Vercel (Production y Preview). Se crea en console.anthropic.com → Settings → API keys, con saldo cargado.
2. Volver a desplegar.

Sin la clave todo lo demás funciona: reportes y exportaciones no dependen de la IA.

## Pendiente para la etapa 5
- Cambio de plan, pasarela de pagos, panel de administración de la plataforma, invitaciones de equipo, revisión de seguridad y preparación para producción.
