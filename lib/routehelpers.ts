// lib/routehelpers.ts
import supabase from "@/lib/supabaseclient";

/** Get role + organization_id from profiles, falling back to users.role (client). */
export async function fetchUserContext() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, role: null as string | null, organization_id: null as string | null };

  // Try profiles first (admin/user/reviewer/superadmin)
  const { data: prof } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (prof?.role) {
    return { user, role: prof.role as string, organization_id: prof.organization_id as string | null };
  }

  // Fallback to users.role (client)
  const { data: urow } = await supabase
    .from("users")
    .select("role, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  const fallbackRole = (urow?.role as string | null) ?? null;
  return { user, role: fallbackRole, organization_id: (urow?.organization_id as string | null) ?? null };
}

/** Decide where to send a signed‑in user. */
export async function choosePostLoginRoute(): Promise<string> {
  const { role } = await fetchUserContext();

  // Clients (advertisers) ➜ dashboard of their creatives
  if (role === "client") return "/dashboard";

  // Staff at billboard company (admin/reviewer/user/superadmin) ➜ inventory
  return "/inventory";
}
