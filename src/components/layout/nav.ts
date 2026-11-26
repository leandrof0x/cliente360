import { CalendarCheck, CalendarDays, KanbanSquare, LayoutDashboard, MessageSquareText, Settings, Users, Workflow, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Visible solo para Propietario y Administrador */
  managersOnly?: boolean;
}

/** Solo se listan módulos que ya funcionan: no hay botones decorativos. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/seguimientos", label: "Seguimientos", icon: CalendarCheck },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/plantillas", label: "Plantillas", icon: MessageSquareText },
  { href: "/automatizaciones", label: "Automatizaciones", icon: Workflow, managersOnly: true },
];

export const NAV_FOOTER: NavItem[] = [{ href: "/configuracion", label: "Configuración", icon: Settings }];
