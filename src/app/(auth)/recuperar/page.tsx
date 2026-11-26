import Link from "next/link";
import type { Metadata } from "next";
import { ResetRequestForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ResetPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Recuperar contraseña</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Te enviaremos un enlace para crear una nueva.</p>
      <ResetRequestForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/ingresar" className="font-medium text-brand-600 hover:text-brand-700">
          Volver a ingresar
        </Link>
      </p>
    </>
  );
}
