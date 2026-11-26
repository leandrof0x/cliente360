import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";

/**
 * Cliente con service_role (ignora RLS). Usar SOLO en el servidor y solo para
 * tareas de sistema (webhooks, automatizaciones, registro de uso de IA).
 */
export function createAdminClient() {
  if (!serverEnv.supabaseServiceRoleKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor");
  }
  return createSupabaseClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
