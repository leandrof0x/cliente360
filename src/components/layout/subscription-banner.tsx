import Link from "next/link";
import { Clock, Lock } from "lucide-react";
import type { OrgContext } from "@/lib/session";

/** Aviso del estado de la cuenta: prueba, vencimiento o solo lectura. */
export function SubscriptionBanner({ ctx }: { ctx: OrgContext }) {
  const sub = ctx.subscription;
  if (ctx.org.status === "suspended") {
    return (
      <Banner tone="danger" icon={<Lock className="h-4 w-4" />}>
        La cuenta está suspendida{ctx.org.suspended_reason ? `: ${ctx.org.suspended_reason}` : ""}. Podés consultar tus
        datos pero no modificarlos. Contactá a soporte de CLIENTE360.
      </Banner>
    );
  }
  if (!ctx.writable) {
    return (
      <Banner tone="danger" icon={<Lock className="h-4 w-4" />}>
        Tu {sub?.status === "trialing" ? "período de prueba terminó" : "suscripción está vencida"}. Tus datos están a salvo
        en modo solo lectura.{" "}
        <Link href="/suscripcion" className="font-semibold underline">
          Ver opciones de plan
        </Link>
      </Banner>
    );
  }
  if (sub?.status === "trialing" && sub.trial_ends_at) {
    const days = Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000));
    if (days <= 14) {
      return (
        <Banner tone="info" icon={<Clock className="h-4 w-4" />}>
          Te {days === 1 ? "queda 1 día" : `quedan ${days} días`} de prueba gratis del plan {ctx.plan?.name}.{" "}
          <Link href="/suscripcion" className="font-semibold underline">
            Ver planes
          </Link>
        </Banner>
      );
    }
  }
  return null;
}

function Banner({ tone, icon, children }: { tone: "info" | "danger"; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = tone === "danger" ? "bg-red-600 text-white" : "bg-brand-600 text-white";
  return (
    <div className={`flex items-center gap-2 px-4 py-2 pl-16 text-sm sm:px-6 lg:px-8 ${cls}`} role="status">
      <span className="shrink-0">{icon}</span>
      <p className="min-w-0">{children}</p>
    </div>
  );
}
