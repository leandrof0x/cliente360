import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatGs } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PlanForm } from "@/components/admin/forms";

export const metadata: Metadata = { title: "Planes" };

export default async function AdminPlansPage() {
  const supabase = await createClient();
  const { data: plans } = await supabase.from("plans").select("id, name, description, price_gs, max_users, max_customers, ai_monthly_requests, is_active").order("sort_order");
  return (
    <>
      <PageHeader title="Planes y precios" description="Los cambios aplican a nuevas contrataciones. Las suscripciones vigentes mantienen su precio pactado hasta que lo cambies en cada empresa." />
      <div className="grid gap-6 lg:grid-cols-3">
        {(plans ?? []).map((p) => (
          <Card key={p.id}>
            <CardHeader title={p.name} description={`${formatGs(p.price_gs)} por mes · código ${p.id}`} />
            <CardBody className="pt-3"><PlanForm plan={p} /></CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
