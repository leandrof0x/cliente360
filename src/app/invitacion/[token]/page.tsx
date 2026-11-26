import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Alert } from "@/components/ui/alert";
import { AcceptInvitationButton } from "@/components/team/accept-invitation";
import { requireUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { ROLE_LABELS } from "@/lib/constants";
import type { OrgRole } from "@/lib/types";

export const metadata: Metadata = { title: "Invitación" };

interface InvitationInfo {
  found: boolean;
  organization?: string;
  role?: OrgRole;
  email?: string;
  email_matches?: boolean;
  accepted?: boolean;
  expired?: boolean;
  already_member?: boolean;
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser();
  const supabase = await createClient();
  const valid = /^[a-f0-9]{32,80}$/.test(token);
  const { data } = valid ? await supabase.rpc("invitation_info", { p_token: token }) : { data: null };
  const info = (data ?? { found: false }) as InvitationInfo;

  let body: React.ReactNode;
  if (!info.found) {
    body = <Alert tone="error" title="Invitación no encontrada">El enlace no es válido. Pedile a quien te invitó que genere uno nuevo.</Alert>;
  } else if (info.already_member) {
    body = (
      <Alert tone="success" title={`Ya sos parte de ${info.organization}`}>
        <Link href="/dashboard" className="font-medium underline">Ir al panel</Link>
      </Alert>
    );
  } else if (info.accepted) {
    body = <Alert tone="info" title="Invitación ya utilizada">Esta invitación ya fue aceptada.</Alert>;
  } else if (info.expired) {
    body = <Alert tone="warning" title="Invitación vencida">Pedile a quien te invitó que genere una nueva.</Alert>;
  } else if (!info.email_matches) {
    body = (
      <Alert tone="warning" title="Esta invitación es para otro correo">
        Fue enviada a {info.email} y vos ingresaste como {user.email}. Cerrá sesión e ingresá (o creá tu cuenta) con el correo invitado.
      </Alert>
    );
  } else {
    body = (
      <>
        <p className="mb-6 text-sm text-slate-600">
          Te invitaron a sumarte a <span className="font-semibold text-slate-900">{info.organization}</span> como{" "}
          <span className="font-semibold text-slate-900">{ROLE_LABELS[info.role as OrgRole]}</span>.
        </p>
        <AcceptInvitationButton token={token} />
      </>
    );
  }

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
            <UserPlus className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900">Invitación al equipo</h1>
          {body}
        </div>
      </div>
    </main>
  );
}
