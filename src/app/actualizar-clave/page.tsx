import type { Metadata } from "next";
import { Logo } from "@/components/ui/logo";
import { UpdatePasswordForm } from "@/components/auth/forms";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function UpdatePasswordPage() {
  await requireUser();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Logo className="mb-6" />
        <h1 className="text-xl font-semibold text-slate-900">Elegí una nueva contraseña</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">La vas a usar para ingresar a CLIENTE360.</p>
        <UpdatePasswordForm />
      </div>
    </main>
  );
}
