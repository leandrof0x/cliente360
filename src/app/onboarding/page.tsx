import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { CreateOrgForm } from "@/components/onboarding/create-org-form";
import { requireUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Configurá tu negocio" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ nueva?: string }> }) {
  const user = await requireUser();
  const { nueva } = await searchParams;
  const supabase = await createClient();
  const { count } = await supabase
    .from("organization_members")
    .select("organization_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  // Si ya pertenece a una empresa y no pidió crear otra, va al panel
  if ((count ?? 0) > 0 && nueva !== "1") redirect("/dashboard");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <form action={signOut}>
            <button className="text-sm text-slate-500 hover:text-slate-800">Cerrar sesión</button>
          </form>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Building2 className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            {nueva === "1" ? "Agregá otro negocio" : "Contanos sobre tu negocio"}
          </h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">
            Creamos un espacio privado para tu empresa. Solo vos y tu equipo pueden ver sus datos. Empezás con 14 días
            de prueba gratis.
          </p>
          <CreateOrgForm />
        </div>
      </div>
    </main>
  );
}
