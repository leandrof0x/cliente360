import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/session";
import { getMemberOptions } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { todayInPy } from "@/lib/date-range";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { CustomerForm } from "@/components/customers/customer-form";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!customer) notFound();
  const members = await getMemberOptions(ctx.org.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar cliente" description={customer.full_name} />
      <Card>
        <CardBody>
          <CustomerForm members={members} today={todayInPy()} initial={customer} />
        </CardBody>
      </Card>
    </div>
  );
}
