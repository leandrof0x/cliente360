"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { NAV_FOOTER, NAV_ITEMS, type NavItem } from "./nav";

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-brand-600 text-white shadow-sm" : "text-slate-300 hover:bg-sidebar-hover hover:text-white",
      )}
    >
      <Icon className={cn("h-[18px] w-[18px]", active ? "text-white" : "text-sidebar-muted group-hover:text-white")} aria-hidden />
      {item.label}
    </Link>
  );
}

export function Sidebar({ orgSwitcher, isManager }: { orgSwitcher: React.ReactNode; isManager: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/dashboard">
          <Logo dark />
        </Link>
        <button className="rounded-md p-1 text-slate-400 hover:text-white lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="px-3 pb-3">{orgSwitcher}</div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Principal">
        {NAV_ITEMS.filter((i) => !i.managersOnly || isManager).map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
      <div className="space-y-1 border-t border-white/5 px-3 py-3">
        {NAV_FOOTER.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>
    </div>
  );

  return (
    <>
      <button
        className="fixed left-3 top-3 z-40 rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-sidebar lg:block">{content}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-sidebar shadow-xl">{content}</aside>
        </div>
      )}
    </>
  );
}
