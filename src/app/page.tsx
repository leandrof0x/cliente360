import Link from "next/link";
import { ArrowRight, BellRing, Bot, CalendarCheck, Check, KanbanSquare, LineChart, MessageCircle, Users } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ButtonLink } from "@/components/ui/button";
import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/env";
import { formatGs } from "@/lib/utils";
import type { Plan } from "@/lib/types";

export const revalidate = 300;

const features = [
  { icon: Users, title: "Clientes organizados", text: "Toda la información de cada cliente, su historial y notas en un solo lugar." },
  { icon: KanbanSquare, title: "Pipeline visual", text: "Mirá en qué etapa está cada consulta y movela con un clic hasta cerrar la venta." },
  { icon: BellRing, title: "Seguimientos que no se olvidan", text: "Recordatorios y alertas de clientes que llevan días sin contacto." },
  { icon: MessageCircle, title: "WhatsApp a un clic", text: "Mensajes personalizados con plantillas, listos para enviar." },
  { icon: CalendarCheck, title: "Agenda y tareas", text: "Reuniones, reservas y llamadas en un calendario simple." },
  { icon: Bot, title: "CLIENTE AI", text: "Redacta respuestas, resume clientes y sugiere el próximo paso." },
];

async function getPlans(): Promise<Plan[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createPublicClient();
    const { data } = await supabase.from("plans").select("*").eq("is_active", true).order("sort_order");
    return (data ?? []) as Plan[];
  } catch {
    return [];
  }
}

export default async function LandingPage() {
  const plans = await getPlans();
  return (
    <div className="bg-white">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="#planes" className="hidden px-3 text-sm font-medium text-slate-600 hover:text-slate-900 sm:block">
            Planes
          </Link>
          <ButtonLink href="/ingresar" variant="ghost" size="sm">
            Ingresar
          </ButtonLink>
          <ButtonLink href="/registro" size="sm">
            Probar gratis
          </ButtonLink>
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-brand-100/60 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-medium text-brand-700">
            <LineChart className="h-3.5 w-3.5" aria-hidden /> CRM simple para negocios de Paraguay
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
            Deja de perder clientes por falta de seguimiento.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            CLIENTE360 organiza tu negocio y te ayuda a convertir más consultas en ventas. Sin capacitaciones, sin
            planillas, sin olvidos.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/registro" size="lg">
              Empezar prueba gratis <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
            <p className="text-sm text-slate-500">14 días gratis · sin tarjeta</p>
          </div>
        </div>
      </section>

      <section className="bg-canvas py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-slate-900">Todo lo que tu negocio necesita para vender más</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <f.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {plans.length > 0 && (
        <section id="planes" className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-slate-900">Planes simples, en guaraníes</h2>
            <p className="mt-2 text-center text-slate-600">Empezá gratis y elegí tu plan cuando estés listo.</p>
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {plans.map((p) => {
                const featured = p.id === "profesional";
                return (
                  <div
                    key={p.id}
                    className={`flex flex-col rounded-2xl border p-6 ${featured ? "border-brand-500 shadow-lg ring-4 ring-brand-50" : "border-slate-200"}`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-slate-900">{p.name}</h3>
                      {featured && <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-medium text-white">Más elegido</span>}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{p.description}</p>
                    <p className="mt-5">
                      <span className="tabular text-3xl font-semibold text-slate-900">{formatGs(p.price_gs)}</span>
                      <span className="text-sm text-slate-500"> /mes</span>
                    </p>
                    <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 text-success-600" aria-hidden />
                        {p.max_users === 1 ? "1 usuario" : `Hasta ${p.max_users} usuarios`}
                      </li>
                      <li className="flex gap-2">
                        <Check className="h-4 w-4 text-success-600" aria-hidden />
                        {p.max_customers ? `Hasta ${p.max_customers} clientes` : "Clientes ilimitados"}
                      </li>
                      {p.ai_monthly_requests > 0 && (
                        <li className="flex gap-2">
                          <Check className="h-4 w-4 text-success-600" aria-hidden />
                          CLIENTE AI: {p.ai_monthly_requests} consultas/mes
                        </li>
                      )}
                      {p.features.reports && (
                        <li className="flex gap-2">
                          <Check className="h-4 w-4 text-success-600" aria-hidden />
                          Reportes {p.features.reports === "advanced" ? "avanzados" : "comerciales"}
                        </li>
                      )}
                      {p.features.automations && (
                        <li className="flex gap-2">
                          <Check className="h-4 w-4 text-success-600" aria-hidden />
                          Automatizaciones {p.features.automations === "advanced" ? "avanzadas" : "básicas"}
                        </li>
                      )}
                    </ul>
                    <ButtonLink href="/registro" variant={featured ? "primary" : "secondary"} className="mt-6 w-full">
                      Probar gratis
                    </ButtonLink>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-slate-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-slate-500 sm:flex-row sm:px-6">
          <Logo />
          <p>© {new Date().getFullYear()} CLIENTE360</p>
        </div>
      </footer>
    </div>
  );
}
