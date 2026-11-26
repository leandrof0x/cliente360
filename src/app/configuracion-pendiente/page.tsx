import { Logo } from "@/components/ui/logo";
import { isSupabaseConfigured } from "@/lib/env";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Se muestra cuando faltan las variables de Supabase: no se simula ningún backend. */
export default function SetupPendingPage() {
  if (isSupabaseConfigured()) redirect("/");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Logo className="mb-6" />
        <h1 className="text-xl font-semibold text-slate-900">Falta conectar la base de datos</h1>
        <p className="mt-2 text-sm text-slate-600">
          CLIENTE360 necesita un proyecto de Supabase para funcionar. Configurá estas variables de entorno y
          reiniciá el servidor:
        </p>
        <ul className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 font-mono text-xs text-slate-800">
          <li>NEXT_PUBLIC_SUPABASE_URL</li>
          <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
          <li>SUPABASE_SERVICE_ROLE_KEY (solo servidor)</li>
          <li>NEXT_PUBLIC_SITE_URL</li>
        </ul>
        <p className="mt-4 text-sm text-slate-600">
          Los pasos completos están en <span className="font-mono">README.md</span> y{" "}
          <span className="font-mono">docs/DESPLIEGUE.md</span>.
        </p>
      </div>
    </main>
  );
}
