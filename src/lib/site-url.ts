import "server-only";
import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";

/** URL pública del sitio. En producción se usa NEXT_PUBLIC_SITE_URL si está configurada. */
export async function siteUrl(): Promise<string> {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SITE_URL) return publicEnv.siteUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : publicEnv.siteUrl.replace(/\/$/, "");
}
