// pages/admin-invite.tsx
import { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabaseclient";
import { useAuthGate } from "@/utils/useauthgate";

type PendingInvite = {
  email: string;
  organization_id: string;
  role: string;
  organization_name?: string;
};

const ROLES = ["superadmin", "admin", "reviewer", "user", "client"] as const;

export default function AdminInvitePage() {

  // Require login
  const { ready } = useAuthGate();

  const [myRole, setMyRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  // Form state
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("admin");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Pending invites list
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);

  // Fetch my role and pending invites
  useEffect(() => {
    if (!ready) return;

    (async () => {
      setLoadingRole(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingRole(false); return; }

      // Try profiles first, fallback to users
      let currentRole: string | null = null;

      const { data: p } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (p?.role) currentRole = p.role as string;

      if (!currentRole) {
        const { data: u } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        currentRole = (u?.role as string | null) ?? null;
      }

      setMyRole(currentRole);
      setLoadingRole(false);

      // Load pending invites (left-join org name for convenience)
      setLoadingPending(true);
      const { data: pend } = await supabase
        .from("pending_org_invites")
        .select("email, organization_id, role, organizations!inner(name)")
        .limit(100);

      const normalized = (pend || []).map((row: any) => ({
        email: row.email,
        organization_id: row.organization_id,
        role: row.role,
        organization_name: row.organizations?.name,
      })) as PendingInvite[];

      setPending(normalized);
      setLoadingPending(false);
    })();
  }, [ready]);

  const isAdmin = useMemo(
    () => myRole === "admin" || myRole === "superadmin",
    [myRole]
  );

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setBusy(true);

    try {
      // Include caller token so API can verify you are admin
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in.");

      const res = await fetch("/api/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email, orgName, role }),
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Invite failed");

      setMsg(`✅ Invitation sent to ${email} for org "${orgName}".`);
      setEmail("");
      setOrgName("");

      // Refresh pending list
      const { data: pend } = await supabase
        .from("pending_org_invites")
        .select("email, organization_id, role, organizations!inner(name)")
        .limit(100);
      const normalized = (pend || []).map((row: any) => ({
        email: row.email,
        organization_id: row.organization_id,
        role: row.role,
        organization_name: row.organizations?.name,
      })) as PendingInvite[];
      setPending(normalized);
    } catch (e: any) {
      setErr(e.message || "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <div className="p-6 text-sm text-neutral-500">Checking session…</div>;
  if (loadingRole) return <div className="p-6 text-sm text-neutral-500">Loading…</div>;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold mb-2">Admin</h1>
        <p className="text-sm text-neutral-600">
          You don’t have permission to access this page.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Admin — Invite Users</h1>
        <p className="text-sm text-neutral-600">
          Send an email invite to a customer admin or teammate. On sign-up, they’ll be
          auto-attached to the org and can start using the app.
        </p>
      </div>

      <form onSubmit={submitInvite} className="rounded-xl border border-neutral-200 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
              placeholder="admin@customer.com"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label className="block text-sm font-medium mb-1">Organization name</label>
            <input
              type="text"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
              placeholder="Acme Billboards"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className={`rounded-md px-4 py-2 text-white ${busy ? "bg-neutral-400" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {busy ? "Sending…" : "Send invite"}
          </button>
          {msg && <span className="text-sm text-green-700">{msg}</span>}
          {err && <span className="text-sm text-red-600">{err}</span>}
        </div>
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Pending invites</h2>
          <span className="text-xs text-neutral-500">{pending.length}</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Email</th>
                <th className="px-3 py-2 text-left font-semibold">Organization</th>
                <th className="px-3 py-2 text-left font-semibold">Role</th>
              </tr>
            </thead>
            <tbody>
              {loadingPending ? (
                <tr><td className="px-3 py-3 text-neutral-500" colSpan={3}>Loading…</td></tr>
              ) : pending.length === 0 ? (
                <tr><td className="px-3 py-3 text-neutral-500" colSpan={3}>No pending invites.</td></tr>
              ) : (
                pending.map((p) => (
                  <tr key={p.email} className="border-t">
                    <td className="px-3 py-2">{p.email}</td>
                    <td className="px-3 py-2">{p.organization_name || p.organization_id}</td>
                    <td className="px-3 py-2">{p.role}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// hide global header for this page (optional)
  (AdminInvitePage as any).noHeader = true;
