import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** Exige ser administrador de CLIENTE360. Para cualquier otra persona, la ruta no existe. */
export async function requirePlatformAdmin() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  if (!data) notFound();
  return user;
}
