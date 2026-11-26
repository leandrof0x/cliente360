import type { Metadata } from "next";
import { getOrgContext } from "@/lib/session";
import { getMemberOptions } from "@/lib/members";
import { todayInPy } from "@/lib/date-range";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { CustomerForm } from "@/components/customers/customer-form";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function NewCustomerPage() {
  const ctx = await getOrgContext();
  const members = await getMemberOptions(ctx.org.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nuevo cliente" description="Solo el nombre es obligatorio. Podés completar el resto después." />
      {!ctx.writable ? (
        <Alert tone="warning">Tu cuenta está en modo solo lectura.</Alert>
      ) : (
        <Card>
          <CardBody>
            <CustomerForm members={members} today={todayInPy()} initial={{ assigned_to: ctx.user.id }} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
