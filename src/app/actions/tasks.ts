"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/session";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

export async function completeTask(taskId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(taskId).success) return { ok: false, error: "Tarea inválida." };
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "completada" })
    .eq("id", taskId)
    .eq("organization_id", ctx.org.id)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "No se encontró la tarea o no tenés permiso." };
  revalidatePath("/", "layout");
  return { ok: true };
}
