import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { SubscriptionBanner } from "@/components/layout/subscription-banner";
import { getOrgContext, canManage } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getOrgContext();
  return (
    <div className="min-h-dvh">
      <Sidebar
        isManager={canManage(ctx.role)}
        orgSwitcher={
          <OrgSwitcher
            current={ctx.org.id}
            role={ctx.role}
            options={ctx.memberships.map((m) => ({ id: m.organization_id, name: m.organizations.name }))}
          />
        }
      />
      <div className="lg:pl-64">
        <SubscriptionBanner ctx={ctx} />
        <Topbar name={ctx.user.fullName} email={ctx.user.email} isPlatformAdmin={ctx.isPlatformAdmin} />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
