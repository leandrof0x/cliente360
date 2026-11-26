import Link from "next/link";
import type { Metadata } from "next";
import { SignUpForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Creá tu cuenta</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Empezá a organizar tus clientes en minutos.</p>
      <SignUpForm />
      <p className="mt-6 text-center text-sm text-slate-600">
        ¿Ya tenés cuenta?{" "}
        <Link href="/ingresar" className="font-medium text-brand-600 hover:text-brand-700">
          Ingresá
        </Link>
      </p>
    </>
  );
}
