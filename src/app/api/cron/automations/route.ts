import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured, serverEnv } from "@/lib/server-env";
import { processOutbox } from "@/lib/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${serverEnv.cronSecret}`;
  if (!serverEnv.cronSecret || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/** Ejecutado por Vercel Cron (ver vercel.json). Requiere CRON_SECRET. */
export async function GET(request: NextRequest) {
  if (!serverEnv.cronSecret || !isServiceRoleConfigured()) {
    return NextResponse.json({ error: "Cron no configurado (CRON_SECRET / SUPABASE_SERVICE_ROLE_KEY)" }, { status: 503 });
  }
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: created, error } = await admin.rpc("run_scheduled_automations", { p_org: null });
  const outbox = await processOutbox({ limit: 200 });
  return NextResponse.json({ ok: !error, scheduledTasksCreated: created ?? 0, outbox, error: error?.message });
}
