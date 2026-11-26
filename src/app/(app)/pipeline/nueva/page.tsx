import type { Metadata } from "next";
import { Users } from "lucide-react";
import { getOrgContext } from "@/lib/session";
import { getMemberOptions } from "@/lib/members";
import { getCustomerOptions } from "@/lib/customers";
import { todayInPy } from "@/lib/date-range";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LeadForm } from "@/components/pipeline/lead-form";

export const metadata: Metadata = { title: "Nueva oportunidad" };

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await searchParams;
  const ctx = await getOrgContext();
  const [customers, members] = await Promise.all([getCustomerOptions(ctx.org.id), getMemberOptions(ctx.org.id)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nueva oportunidad" description="Registrá una consulta o posible venta y seguila en el pipeline." />
      {!ctx.writable ? (
        <Alert tone="warning">Tu cuenta está en modo solo lectura.</Alert>
      ) : customers.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="Primero registrá un cliente" description="Cada oportunidad está asociada a un cliente." action={<ButtonLink href="/clientes/nuevo">Nuevo cliente</ButtonLink>} />
        </Card>
      ) : (
        <Card>
          <CardBody>
            <LeadForm
              customers={customers}
              members={members}
              today={todayInPy()}
              initial={{ customer_id: customers.some((c) => c.id === cliente) ? cliente : undefined, assigned_to: ctx.user.id }}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
