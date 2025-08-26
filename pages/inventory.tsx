// pages/inventory.tsx
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import supabase from "@/lib/supabaseclient";
import BoardTile from "@/components/inventory/boardtile";
import { useAuthGate } from "@/utils/useauthgate";

export default function InventoryPage() {
  // Guard: Redirects to /login if not signed in
  const { ready } = useAuthGate();

  const router = useRouter();
  const [orgId, setOrgId] = useState<string>("");
  const [boards, setBoards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return; // wait until auth check is finished

    (async () => {
      setLoading(true);

      // Get the current user/session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // ---- ROLE CHECK (clients go to dashboard) ----
      // Prefer profiles.role (admin/user/reviewer/superadmin), fallback to users.role (client)
      let role: string | null = null;
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (prof?.role) {
        role = prof.role as string;
      } else {
        const { data: urow } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        role = (urow?.role as string | null) ?? null;
      }

      if (role === "client") {
        router.replace("/dashboard");
        return;
      }
      // ----------------------------------------------

      // Determine org (first membership for now)
      const { data: memberships } = await supabase
        .from("user_organizations")
        .select("organization_id")
        .eq("user_id", user.id);

      const currentOrgId = memberships?.[0]?.organization_id as string | undefined;
      if (!currentOrgId) { setLoading(false); return; }
      setOrgId(currentOrgId);

      // Load boards for the org (RLS also enforces same‑org)
      const { data, error } = await supabase
        .from("boards")
        .select("id, board_name, location, spec_group, width_display, height_display, width_px, height_px, hero_image_path")
        .eq("organization_id", currentOrgId)
        .order("spec_group", { ascending: true });

      if (!error) setBoards(data || []);
      setLoading(false);
    })();
  }, [ready, router]);

  // Group boards by spec_group
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const b of boards) {
      const key = b.spec_group || "ungrouped";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return Array.from(map.entries());
  }, [boards]);

  // While we’re checking session, keep it minimal
  if (!ready) return <div className="p-6 text-sm text-neutral-500">Checking session…</div>;

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
      </div>

      {loading && <p className="text-sm text-neutral-500">Loading…</p>}

      {!loading && grouped.map(([group, items]) => (
        <section key={group} className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium">{group}</h2>
            <span className="text-xs text-neutral-500">{items.length} boards</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((b: any) => (
              <BoardTile key={b.id} board={b} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
