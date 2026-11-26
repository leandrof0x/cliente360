import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LogOut, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { requirePlatformAdmin } from "@/lib/platform";
import { signOut } from "@/app/actions/auth";

export const metadata: Metadata = { title: { default: "Administración", template: "%s · Administración CLIENTE360" }, robots: { index: false } };

const NAV = [
  { href: "/admin", label: "Resumen y empresas" },
  { href: "/admin/planes", label: "Planes y precios" },
  { href: "/admin/ajustes", label: "Ajustes" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
              <ShieldCheck className="h-3 w-3" /> Plataforma
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">{user.email}</span>
            <Link href="/dashboard" className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Volver a la app</Link>
            <form action={signOut}>
              <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut className="h-4 w-4" /></button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8" aria-label="Administración">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-slate-900">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
