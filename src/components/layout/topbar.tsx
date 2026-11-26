import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { initials } from "@/lib/utils";

export function Topbar({ name, email }: { name: string | null; email: string | null }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-end gap-3 border-b border-slate-200/70 bg-canvas/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight text-slate-900">{name ?? email}</p>
          {name && <p className="text-xs leading-tight text-slate-500">{email}</p>}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700" aria-hidden>
          {initials(name ?? email)}
        </div>
        <form action={signOut}>
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </form>
      </div>
    </header>
  );
}
