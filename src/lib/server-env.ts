import "server-only";

/** Variables secretas: nunca se envían al navegador. */
export const serverEnv = {
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};
