import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE } from "@/lib/constants";
import type { Membership, OrgRole, Plan, Subscription } from "@/lib/types";

export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/ingresar");
  return user;
}

export interface OrgContext {
  user: { id: string; email: string | null; fullName: string | null };
  memberships: Membership[];
  membership: Membership;
  org: Membership["organizations"];
  role: OrgRole;
  subscription: Subscription | null;
  plan: Plan | null;
  writable: boolean;
  isPlatformAdmin: boolean;
}

/**
 * Contexto de la empresa activa. La empresa activa se guarda en una cookie,
 * pero SIEMPRE se valida contra las membresías reales del usuario (RLS).
 */
export const getOrgContext = cache(async (): Promise<OrgContext> => {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: memberships }, { data: profile }, { data: isAdmin }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("organization_id, role, organizations(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.rpc("is_platform_admin"),
  ]);

  const list = (memberships ?? []) as unknown as Membership[];
  if (list.length === 0) redirect("/onboarding");

  const cookieStore = await cookies();
  const selected = cookieStore.get(ORG_COOKIE)?.value;
  const membership = list.find((m) => m.organization_id === selected) ?? list[0];

  const [{ data: subscription }, { data: writable }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*, plans(*)")
      .eq("organization_id", membership.organization_id)
      .maybeSingle(),
    supabase.rpc("org_is_writable", { org: membership.organization_id }),
  ]);

  const sub = subscription as (Subscription & { plans: Plan | null }) | null;

  return {
    user: { id: user.id, email: user.email ?? null, fullName: (profile?.full_name as string | null) ?? null },
    memberships: list,
    membership,
    org: membership.organizations,
    role: membership.role,
    subscription: sub,
    plan: sub?.plans ?? null,
    writable: Boolean(writable),
    isPlatformAdmin: Boolean(isAdmin),
  };
});

export function canManage(role: OrgRole) {
  return role === "owner" || role === "admin";
}
