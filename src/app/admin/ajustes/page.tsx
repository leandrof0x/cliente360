import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { SettingsForm } from "@/components/admin/forms";

export const metadata: Metadata = { title: "Ajustes" };

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: plans }] = await Promise.all([
    supabase.from("platform_settings").select("key, value"),
    supabase.from("plans").select("id, name").eq("is_active", true).order("sort_order"),
  ]);
  const get = (k: string) => (settings ?? []).find((s) => s.key === k)?.value;
  const values = {
    trial_days: Number(get("trial_days") ?? 14),
    trial_plan: String(get("trial_plan") ?? "profesional"),
    payment_instructions: String(get("payment_instructions") ?? ""),
    support_contact: String(get("support_contact") ?? ""),
  };
  return (
    <>
      <PageHeader title="Ajustes de la plataforma" description="Prueba gratis, instrucciones de pago y contacto de soporte." />
      <Card className="max-w-2xl">
        <CardBody><SettingsForm values={values} plans={plans ?? []} /></CardBody>
      </Card>
    </>
  );
}
