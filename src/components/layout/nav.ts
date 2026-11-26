import { CalendarCheck, KanbanSquare, LayoutDashboard, Settings, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Solo se listan módulos que ya funcionan: no hay botones decorativos. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/seguimientos", label: "Seguimientos", icon: CalendarCheck },
];

export const NAV_FOOTER: NavItem[] = [{ href: "/configuracion", label: "Configuración", icon: Settings }];
