/**
 * Contrato para integrar una pasarela de pagos de Paraguay (por ejemplo
 * Bancard vPOS, Pagopar o la pasarela de un banco local).
 *
 * Estado: PREPARADO, SIN IMPLEMENTAR. CLIENTE360 no cobra nada automáticamente:
 * hoy los pagos se confirman manualmente desde el panel de la plataforma
 * (`platform_record_payment`), que activa la suscripción y extiende el período.
 *
 * Para integrar una pasarela:
 * 1. Implementar `PaymentGateway` con la API oficial del proveedor (credenciales solo en el servidor).
 * 2. Crear `/api/webhooks/pagos/<proveedor>` que llame a `verifyWebhook` y, si el pago
 *    está confirmado, ejecute `platform_record_payment` con el cliente de servicio
 *    (o una función equivalente restringida a service_role).
 * 3. Mostrar el botón "Pagar en línea" en /suscripcion solo cuando la pasarela esté configurada.
 */
export interface CheckoutRequest {
  organizationId: string;
  planId: string;
  amountGs: number;
  months: number;
  description: string;
  /** URL a la que vuelve la persona después de pagar. */
  returnUrl: string;
}

export interface CheckoutSession {
  /** Identificador del pago en la pasarela (se guarda en payments.provider_ref). */
  providerRef: string;
  /** URL de la página de pago de la pasarela. */
  redirectUrl: string;
}

export interface WebhookResult {
  providerRef: string;
  status: "paid" | "failed" | "pending" | "refunded";
  amountGs: number;
  organizationId: string;
  months: number;
}

export interface PaymentGateway {
  readonly id: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Verifica la firma/token del aviso de la pasarela y devuelve el resultado. Debe rechazar avisos no firmados. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookResult>;
}
