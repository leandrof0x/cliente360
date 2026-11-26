import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/ui/logo";

const points = [
  "Todas tus consultas y clientes en un solo lugar",
  "Seguimientos que no se olvidan",
  "Pipeline visual de ventas",
  "Indicadores reales de tu negocio",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand-600/30 blur-3xl"
        />
        <Link href="/" className="relative">
          <Logo dark />
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Deja de perder clientes por falta de seguimiento.
          </h2>
          <p className="mt-3 text-sidebar-muted">
            CLIENTE360 organiza tu negocio y te ayuda a convertir más consultas en ventas.
          </p>
          <ul className="mt-8 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-3 text-sm text-slate-200">
                <CheckCircle2 className="h-5 w-5 text-success-500" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-muted">© {new Date().getFullYear()} CLIENTE360</p>
      </aside>
      <main className="flex items-center justify-center bg-white px-4 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block lg:hidden">
            <Logo />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
