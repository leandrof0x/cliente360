import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CLIENTE360", template: "%s · CLIENTE360" },
  description:
    "Deja de perder clientes por falta de seguimiento. CLIENTE360 organiza tu negocio y te ayuda a convertir más consultas en ventas.",
};

export const viewport: Viewport = {
  themeColor: "#2447f5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-PY">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
