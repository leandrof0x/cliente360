import Link from "next/link";
import type { Metadata } from "next";
import { SignInForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Ingresar" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bienvenido de nuevo</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Ingresá a tu cuenta de CLIENTE360.</p>
      <SignInForm next={next} linkError={error === "enlace"} />
      <p className="mt-6 text-center text-sm text-slate-600">
        ¿No tenés cuenta?{" "}
        <Link href={next && next.startsWith("/") && !next.startsWith("//") ? `/registro?next=${encodeURIComponent(next)}` : "/registro"} className="font-medium text-brand-600 hover:text-brand-700">
          Creá una gratis
        </Link>
      </p>
    </>
  );
}
