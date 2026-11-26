import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/** Cliente anónimo sin sesión (datos públicos como los planes). */
export function createPublicClient() {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
