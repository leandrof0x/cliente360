import "server-only";

/** Variables secretas: nunca se envían al navegador. */
export const serverEnv = {
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  // WhatsApp Business Platform (Cloud API) — configuración de la app de Meta
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET ?? "",
  whatsappGraphVersion: process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0",
  // Protege el endpoint de tareas programadas (Vercel Cron)
  cronSecret: process.env.CRON_SECRET ?? "",
};

export const isServiceRoleConfigured = () => Boolean(serverEnv.supabaseServiceRoleKey);
export const isWhatsAppWebhookConfigured = () =>
  Boolean(serverEnv.whatsappVerifyToken && serverEnv.whatsappAppSecret && serverEnv.supabaseServiceRoleKey);
