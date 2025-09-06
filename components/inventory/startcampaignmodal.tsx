// components/inventory/startcampaignmodal.tsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import supabase from "@/lib/supabaseclient";

/* ---------- types ---------- */

type CustomerRow = {
  id: string;
  organization_id: string;
  name: string | null;
  email: string | null;
  // (table may also have first_name, last_name, etc., but we only need these to list)
};

type Step1Form = {
  name: string;
  description?: string;
  customerId?: string;
  newCustomer?: {
    firstName: string;
    lastName: string;
    email: string;
    notes?: string;

    // Progressive disclosure extras
    company?: string;
    phone?: string;
    billingEmail?: string;
    address1?: string;
    city?: string;
    state?: string;
    postal?: string;
  } | null;
  startDate?: string; // yyyy-mm-dd
  endDate?: string;   // yyyy-mm-dd
};

type BoardRow = {
  id: string;
  organization_id: string;
  board_name: string | null;
  location: string | null;
  spec_group: string | null;
  width_display: string | null;
  height_display: string | null;
  width_px: number | null;
  height_px: number | null;
  hero_image_path: string | null;
};

type GroupInfo = {
  label: string;
  items: BoardRow[];
  width_px?: number | null;
  height_px?: number | null;
  mergedSpecGroups?: string[];
};

/* ---------- component ---------- */

export default function StartCampaignModal({
  open,
  boardIds,
  onClose,
}: {
  open: boolean;
  boardIds: string[];
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);

  // org and customers (for step 1)
  const [orgId, setOrgId] = useState<string>("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  // step 1 form
  const [form, setForm] = useState<Step1Form>({
    name: "",
    description: "",
    customerId: undefined,
    newCustomer: null,
    startDate: "",
    endDate: "",
  });
  const [error, setError] = useState<string>("");

  // step 2: boards & grouping
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [included, setIncluded] = useState<Set<string>>(new Set());

  // create action result
  const [createError, setCreateError] = useState<string>("");
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);

  /* ---------- lifecycle: reset on open/close ---------- */
  useEffect(() => {
    if (!open) {
      setStep(1);
      setShowNewCustomer(false);
      setError("");
      setCreateError("");
      setCreatedCampaignId(null);
      setForm({
        name: "",
        description: "",
        customerId: undefined,
        newCustomer: null,
        startDate: "",
        endDate: "",
      });
      setBoards([]);
      setIncluded(new Set());
    }
  }, [open]);

  /* ---------- org + customers (step 1 setup) ---------- */
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data: memberships } = await supabase
          .from("user_organizations")
          .select("organization_id")
          .eq("user_id", user.id);

        const currentOrgId = memberships?.[0]?.organization_id as string | undefined;
        if (!currentOrgId) { setLoading(false); return; }
        setOrgId(currentOrgId);

        // customers list (table exists with RLS from your migration)
        const { data, error } = await supabase
          .from("customers")
          .select("id, organization_id, name, email")
          .eq("organization_id", currentOrgId)
          .order("name", { ascending: true });

        if (!error && data) setCustomers(data as CustomerRow[]);
      } catch {
        // ignore; keeps UI clean
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === form.customerId),
    [customers, form.customerId]
  );

  /* ---------- step 1 validation ---------- */
  const canContinueStep1 = useMemo(() => {
    if (!form.name.trim()) return false;
    if (showNewCustomer) {
      const nc = form.newCustomer;
      if (!nc || !nc.firstName?.trim() || !nc.lastName?.trim() || !nc.email?.trim()) return false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nc.email.trim())) return false;
      return true;
    }
    return !!form.customerId;
  }, [form, showNewCustomer]);

  const onNextFromStep1 = () => {
    if (!canContinueStep1) {
      setError("Please complete the required fields.");
      return;
    }
    setError("");
    setStep(2);
  };

  /* ---------- step 2: load board rows ---------- */
  useEffect(() => {
    if (!open) return;
    if (step !== 2) return;
    if (!orgId) return;
    if (!boardIds?.length) {
      setBoards([]);
      setIncluded(new Set());
      return;
    }

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("boards")
        .select("id, organization_id, board_name, location, spec_group, width_display, height_display, width_px, height_px, hero_image_path")
        .eq("organization_id", orgId)
        .in("id", boardIds);

      if (!error && data) {
        const rows = data as BoardRow[];
        setBoards(rows);
        setIncluded(new Set(rows.map((b) => b.id)));
      }
      setLoading(false);
    })();
  }, [open, step, orgId, boardIds]);

  /* ---------- grouping logic ---------- */

  const creativeKey = (b: BoardRow) => {
    const w = b.width_px ?? 0;
    const h = b.height_px ?? 0;
    if (w > 0 && h > 0) return `px:${w}x${h}`;
    if (b.spec_group && b.spec_group.trim().length > 0) return `group:${b.spec_group.trim()}`;
    return "misc";
  };

  const creativeLabel = (b: BoardRow) => {
    const w = b.width_px ?? null;
    const h = b.height_px ?? null;
    if (w && h) return `${w}×${h} px`;
    if (b.spec_group && b.spec_group.trim().length > 0) return b.spec_group.trim();
    return "Unspecified spec";
  };

  const grouped = useMemo(() => {
    const map = new Map<string, GroupInfo>();
    for (const b of boards) {
      const key = creativeKey(b);
      const label = creativeLabel(b);
      if (!map.has(key)) {
        map.set(key, {
          label,
          items: [],
          width_px: b.width_px ?? null,
          height_px: b.height_px ?? null,
          mergedSpecGroups: [],
        });
      }
      map.get(key)!.items.push(b);
    }
    for (const [, g] of map) {
      const specSet = new Set<string>();
      for (const it of g.items) {
        const s = (it.spec_group || "").trim();
        if (s) specSet.add(s);
      }
      g.mergedSpecGroups = Array.from(specSet);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].label.localeCompare(b[1].label, undefined, { numeric: true })
    );
  }, [boards]);

  const activeGroups = useMemo(() => {
    return grouped.filter(([, grp]) => grp.items.some((b) => included.has(b.id)));
  }, [grouped, included]);

  const includedCount = included.size;
  const totalBoards = boards.length;

  const toggleBoard = (id: string) => {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeGroup = (grpIds: string[]) => {
    setIncluded((prev) => {
      const next = new Set(prev);
      grpIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const restoreGroup = (grpIds: string[]) => {
    setIncluded((prev) => {
      const next = new Set(prev);
      grpIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const boardsSummary = useMemo(() => {
    if (!totalBoards) return "—";
    return `${includedCount} of ${totalBoards} boards`;
  }, [includedCount, totalBoards]);

  /* ---------- create campaign ---------- */

  const handleCreateCampaign = async () => {
    setCreateError("");
    setCreatedCampaignId(null);

    try {
      setLoading(true);

      // 1) current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      if (!orgId) throw new Error("No organization found.");

      // 2) ensure customer id (create if needed)
      let customerId = form.customerId || null;
      if (!customerId && showNewCustomer && form.newCustomer) {
        const extras = form.newCustomer;

        const displayName =
          [extras.firstName, extras.lastName].filter(Boolean).join(" ").trim() ||
          extras.company ||
          "Customer";

        const extrasLines = [
          extras.company && `Company: ${extras.company}`,
          extras.phone && `Phone: ${extras.phone}`,
          extras.billingEmail && `Billing email: ${extras.billingEmail}`,
          extras.address1 && `Address: ${extras.address1}`,
          (extras.city || extras.state || extras.postal) &&
          `City/State/Zip: ${[extras.city, extras.state, extras.postal].filter(Boolean).join(", ")}`,
        ].filter(Boolean) as string[];

        const combinedNotes = [extras.notes, extrasLines.join("\n")].filter(Boolean).join("\n\n");

        // structured fields + legacy `name`
        const payload: any = {
          organization_id: orgId,
          name: displayName,
          email: extras.email,
          first_name: extras.firstName || null,
          last_name: extras.lastName || null,
          company: extras.company || null,
          phone: extras.phone || null,
          billing_email: extras.billingEmail || null,
          address1: extras.address1 || null,
          city: extras.city || null,
          state: extras.state || null,
          postal: extras.postal || null,
          notes: combinedNotes || null,
        };

        // upsert on (organization_id, email)
        const { data: up, error: upErr } = await supabase
          .from("customers")
          .upsert(payload, { onConflict: "organization_id,email", ignoreDuplicates: false })
          .select("id")
          .maybeSingle();

        if (upErr) throw new Error(`Failed to create customer (customers table / RLS): ${upErr.message}`);
        customerId = up?.id || null;
      }
      if (!customerId) throw new Error("Customer not selected.");

      // 3) create campaign
      const camp = {
        organization_id: orgId,
        customer_id: customerId,
        name: form.name.trim(),
        description: form.description || null,
        start_date: form.startDate || null,
        end_date: form.endDate || null,
        status: "draft",
      } as any;

      const { data: campRow, error: campErr } = await supabase
        .from("campaigns")
        .insert(camp)
        .select("id")
        .maybeSingle();

      if (campErr) throw new Error(`Failed to create campaign (campaigns table / RLS): ${campErr.message}`);

      const campaignId = campRow?.id as string;
      if (!campaignId) throw new Error("No campaign id returned.");

      // --- AUDIT: log campaign creation (no UI change) ---
      try {
        await supabase.from("audit_events").insert({
          organization_id: orgId,
          event_kind: "campaign_created",      // enum or text; SQL above ensured label exists if enum
          event: "campaign.created",           // also set legacy text field to be safe
          actor_user_id: user.id,
          actor_role: "staff",
          campaign_id: campaignId,
          context: {
            name: form.name || null,
            start_date: form.startDate || null,
            end_date: form.endDate || null,
            board_count: Array.from(included).length,
            group_count: (activeGroups?.length ?? 0),
          },
        });
      } catch (e) {
        // don't block creation if audit insert fails; just log to console for debugging
        console.warn("[audit_events] insert failed:", e);
      }


      // 4) campaign_boards
      const boardRows = Array.from(included).map((board_id) => ({
        campaign_id: campaignId,
        board_id,
      }));
      if (boardRows.length > 0) {
        const { error: cbErr } = await supabase.from("campaign_boards").insert(boardRows);
        if (cbErr) throw new Error(`Failed to attach boards (campaign_boards table / RLS): ${cbErr.message}`);
      }

      // 5) campaign_creative_groups (by pixel spec)
      const groupRows = activeGroups.map(([key, grp]) => ({
        campaign_id: campaignId,
        group_key: key,
        label: grp.label,
        width_px: grp.width_px ?? null,
        height_px: grp.height_px ?? null,
        status: "pending",
      }));
      if (groupRows.length > 0) {
        const { error: cgErr } = await supabase.from("campaign_creative_groups").insert(groupRows);
        if (cgErr) throw new Error(`Failed to create creative groups (campaign_creative_groups / RLS): ${cgErr.message}`);
      }

      // 6) AUDIT (non-blocking) — write both event_type and legacy event
      (async () => {
        try {
          await supabase.from("audit_events").insert({
            organization_id: orgId,
            campaign_id: campaignId,
            event_type: "campaign.create",  // new canonical column
            event: "campaign.create",       // legacy column kept in sync
            actor_user_id: user.id,
            actor_email: user.email,
            meta: {
              name: form.name,
              boardsAttached: boardRows.length,
              groupsCreated: groupRows.length,
              customerId,
            },
          });
        } catch (e) {
          console.warn("[audit] insert failed (non-blocking)", e);
        }
      })();

      setCreatedCampaignId(campaignId);
    } catch (e: any) {
      console.error(e);
      setCreateError(e?.message || "Failed to create campaign.");
    } finally {
      setLoading(false);
    }
  };


  /* ---------- render ---------- */

  const modal = (
    <>
      {/* backdrop (high z to cover page header) */}
      <div
        className={`fixed inset-0 z-[1000] transition ${open ? "bg-black/40" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      {/* modal container */}
      <div
        className={
          "fixed inset-0 z-[1001] flex items-center justify-center p-4 " +
          (open ? "" : "pointer-events-none opacity-0")
        }
        aria-hidden={!open}
      >
        <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-medium">Start campaign</h3>
              <StepPill n={1} label="Details" active={step === 1} done={step > 1} />
              <StepPill n={2} label="Boards" active={step === 2} done={step > 2} />
              <StepPill n={3} label="Review" active={step === 3} done={false} />
            </div>
            <div className="flex items-center gap-2">
              {/* Dev-only autofill */}
              {process.env.NODE_ENV !== "production" && (
                <button
                  onClick={() => {
                    const today = new Date();
                    const in7 = new Date(today.getTime() + 7 * 86400000);
                    setShowNewCustomer(true);
                    setStep(1);
                    setForm((f) => ({
                      ...f,
                      name: f.name || "Test Campaign",
                      startDate: f.startDate || today.toISOString().slice(0, 10),
                      endDate: f.endDate || in7.toISOString().slice(0, 10),
                      customerId: undefined,
                      newCustomer: {
                        firstName: "Test",
                        lastName: "User",
                        email: `test+${Math.floor(Math.random() * 100000)}@example.com`,
                        notes: "Dev autofill",
                        company: "Acme Co",
                        phone: "555-555-1212",
                        billingEmail: "billing@example.com",
                        address1: "123 Main St",
                        city: "Springfield",
                        state: "IL",
                        postal: "62701",
                      },
                    }));
                  }}
                  className="px-2.5 py-1.5 text-xs rounded-md border border-zinc-300 hover:bg-zinc-100"
                  title="Dev autofill"
                >
                  Autofill
                </button>
              )}
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm"
              >
                Close
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px]">
              {/* Left: step content */}
              <div className="p-5">
                {step === 1 && (
                  <Step1Details
                    loading={loading}
                    form={form}
                    setForm={setForm}
                    customers={customers}
                    showNewCustomer={showNewCustomer}
                    setShowNewCustomer={setShowNewCustomer}
                  />
                )}

                {step === 2 && (
                  <Step2Boards
                    loading={loading}
                    grouped={grouped}
                    included={included}
                    onToggleBoard={toggleBoard}
                    onRemoveGroup={removeGroup}
                    onRestoreGroup={restoreGroup}
                  />
                )}

                {step === 3 && (
                  <Step3Review
                    form={form}
                    selectedCustomer={selectedCustomer}
                    boardsSummary={boardsSummary}
                    activeGroups={activeGroups}
                  />
                )}

                {step === 1 && error && (
                  <div className="mt-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3">
                    {error}
                  </div>
                )}

                {step === 3 && createError && (
                  <div className="mt-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3">
                    {createError}
                  </div>
                )}

                {step === 3 && createdCampaignId && (
                  <div className="mt-4 text-sm text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-800 rounded-lg p-3">
                    Campaign created! ID: <span className="font-mono">{createdCampaignId}</span>
                  </div>
                )}
              </div>

              {/* Right: summary */}
              <aside className="p-5 border-t md:border-t-0 md:border-l border-zinc-200 dark:border-zinc-800">
                <div className="text-sm font-medium mb-2">Summary</div>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-zinc-500">Boards</div>
                    <div>{boardsSummary}</div>
                  </div>

                  <div>
                    <div className="text-xs text-zinc-500">Creatives required (for client)</div>
                    <div>{activeGroups.length || 0}</div>
                  </div>

                  <div>
                    <div className="text-xs text-zinc-500">Customer</div>
                    <div>
                      {showNewCustomer
                        ? ([
                          form.newCustomer?.firstName,
                          form.newCustomer?.lastName,
                        ].filter(Boolean).join(" ") || "(new)")
                        : (selectedCustomer?.name || "—")}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-zinc-500">Dates</div>
                    <div>
                      {(form.startDate || "—")} → {(form.endDate || "—")}
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center justify-between shrink-0">
            <div className="text-xs text-zinc-500">Step {step} of 3</div>
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
                  className="px-3 py-1.5 rounded-full border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm"
                >
                  Back
                </button>
              )}

              {step === 1 && (
                <button
                  onClick={onNextFromStep1}
                  disabled={!canContinueStep1}
                  className="px-3 py-1.5 rounded-full border border-blue-600 bg-blue-600 text-white disabled:opacity-50 text-sm shadow"
                >
                  Next
                </button>
              )}

              {step === 2 && (
                <button
                  onClick={() => setStep(3)}
                  disabled={included.size === 0 || activeGroups.length === 0}
                  className="px-3 py-1.5 rounded-full border border-blue-600 bg-blue-600 text-white disabled:opacity-50 text-sm shadow"
                >
                  Continue
                </button>
              )}

              {step === 3 && (
                <button
                  onClick={handleCreateCampaign}
                  disabled={loading || activeGroups.length === 0}
                  className="px-3 py-1.5 rounded-full border border-emerald-600 bg-emerald-600 text-white disabled:opacity-50 text-sm shadow"
                >
                  Create campaign
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

/* ---------- Step 1 subview (with progressive disclosure) ---------- */

function Step1Details({
  loading,
  form,
  setForm,
  customers,
  showNewCustomer,
  setShowNewCustomer,
}: {
  loading: boolean;
  form: Step1Form;
  setForm: React.Dispatch<React.SetStateAction<Step1Form>>;
  customers: CustomerRow[];
  showNewCustomer: boolean;
  setShowNewCustomer: (v: boolean) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="text-sm text-zinc-600 dark:text-zinc-300">
        Fill in the basics. You can invite the customer after reviewing.
      </div>

      <Field label="Campaign name" required>
        <input
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
          placeholder="e.g. Fall 2025 Launch"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </Field>

      <Field label="Description">
        <textarea
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm min-h-[72px]"
          placeholder="Optional notes for your team"
          value={form.description || ""}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </Field>

      {/* Customer picker / new customer */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Customer</div>
          <button
            className="text-sm px-2 py-1 rounded-md border border-blue-600 text-blue-600 hover:bg-blue-50"
            onClick={() => {
              setShowNewCustomer(!showNewCustomer);
              setForm((f) => ({
                ...f,
                customerId: undefined,
                newCustomer: !showNewCustomer
                  ? { firstName: "", lastName: "", email: "", notes: "" }
                  : null,
              }));
              setMoreOpen(false);
            }}
          >
            {showNewCustomer ? "Use existing" : "Add new"}
          </button>
        </div>

        {!showNewCustomer ? (
          <div className="mt-3">
            <select
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
              value={form.customerId || ""}
              onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value || undefined }))}
            >
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || "(no name)"}{c.email ? ` — ${c.email}` : ""}
                </option>
              ))}
            </select>
            {loading && <div className="text-xs text-zinc-500 mt-1">Loading customers…</div>}
            {!loading && customers.length === 0 && (
              <div className="text-xs text-zinc-500 mt-1">No customers yet.</div>
            )}
          </div>
        ) : (
          <>
            {/* Essentials: First / Last / Email */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="block text-xs text-zinc-500 mb-1">First name</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                  value={form.newCustomer?.firstName || ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      newCustomer: {
                        ...(f.newCustomer || { lastName: "", email: "" }),
                        firstName: e.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs text-zinc-500 mb-1">Last name</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                  value={form.newCustomer?.lastName || ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      newCustomer: {
                        ...(f.newCustomer || { firstName: "", email: "" }),
                        lastName: e.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs text-zinc-500 mb-1">Email</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                  value={form.newCustomer?.email || ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      newCustomer: {
                        ...(f.newCustomer || { firstName: "", lastName: "" }),
                        email: e.target.value,
                      },
                    }))
                  }
                />
              </div>
            </div>

            {/* More details toggle */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <span className={"transition-transform " + (moreOpen ? "rotate-90" : "")}>▸</span>
                More details (optional)
              </button>
            </div>

            {/* Collapsible extras */}
            {moreOpen && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs text-zinc-500 mb-1">Company</label>
                  <input
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                    value={form.newCustomer?.company || ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        newCustomer: { ...(f.newCustomer || {}), company: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-zinc-500 mb-1">Phone</label>
                  <input
                    inputMode="tel"
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                    value={form.newCustomer?.phone || ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        newCustomer: { ...(f.newCustomer || {}), phone: e.target.value },
                      }))
                    }
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs text-zinc-500 mb-1">Billing email</label>
                  <input
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                    value={form.newCustomer?.billingEmail || ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        newCustomer: { ...(f.newCustomer || {}), billingEmail: e.target.value },
                      }))
                    }
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs text-zinc-500 mb-1">Address line 1</label>
                  <input
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                    value={form.newCustomer?.address1 || ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        newCustomer: { ...(f.newCustomer || {}), address1: e.target.value },
                      }))
                    }
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs text-zinc-500 mb-1">City</label>
                  <input
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                    value={form.newCustomer?.city || ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        newCustomer: { ...(f.newCustomer || {}), city: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-zinc-500 mb-1">State</label>
                  <input
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                    value={form.newCustomer?.state || ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        newCustomer: { ...(f.newCustomer || {}), state: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-zinc-500 mb-1">Postal code</label>
                  <input
                    inputMode="numeric"
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                    value={form.newCustomer?.postal || ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        newCustomer: { ...(f.newCustomer || {}), postal: e.target.value },
                      }))
                    }
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs text-zinc-500 mb-1">Notes</label>
                  <input
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                    value={form.newCustomer?.notes || ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        newCustomer: { ...(f.newCustomer || {}), notes: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Start date">
          <input
            type="date"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
            value={form.startDate || ""}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
            value={form.endDate || ""}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
          />
        </Field>
      </div>
    </div>
  );
}

/* ---------- Step 2 subview ---------- */

function Step2Boards({
  loading,
  grouped,
  included,
  onToggleBoard,
  onRemoveGroup,
  onRestoreGroup,
}: {
  loading: boolean;
  grouped: Array<[string, GroupInfo]>;
  included: Set<string>;
  onToggleBoard: (id: string) => void;
  onRemoveGroup: (ids: string[]) => void;
  onRestoreGroup: (ids: string[]) => void;
}) {
  if (loading && grouped.length === 0) {
    return <div className="text-sm text-zinc-500">Loading boards…</div>;
  }
  if (grouped.length === 0) {
    return <div className="text-sm text-zinc-500">No boards selected.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="text-sm text-zinc-600 dark:text-zinc-300">
        Boards are grouped by <strong>pixel dimensions</strong> (or spec group if dimensions are missing).
        Clients will upload <strong>one creative per pixel spec</strong> in their portal.
      </div>

      {grouped.map(([key, grp]) => {
        const ids = grp.items.map((b) => b.id);
        const anyIn = grp.items.some((b) => included.has(b.id));
        const noneIn = !anyIn;
        const allIn = ids.every((id) => included.has(id));
        const someIn = anyIn && !allIn;

        return (
          <section key={key} className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <header className="flex items-center justify-between p-3 bg-zinc-50/60 dark:bg-zinc-900/60">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{grp.label}</span>
                <span className="text-xs text-zinc-500">{grp.items.length} board{grp.items.length === 1 ? "" : "s"}</span>
                <span className="text-xs px-2 py-0.5 rounded-full border border-blue-600 text-blue-700">
                  1 creative
                </span>
                {grp.mergedSpecGroups && grp.mergedSpecGroups.length > 1 && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-violet-500 text-violet-700" title={grp.mergedSpecGroups.join(", ")}>
                    merges {grp.mergedSpecGroups.length} groups
                  </span>
                )}
                {someIn && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-amber-500 text-amber-700">
                    partially excluded
                  </span>
                )}
                {noneIn && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-zinc-300 text-zinc-500">
                    excluded
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!noneIn ? (
                  <button
                    onClick={() => onRemoveGroup(ids)}
                    className="px-2.5 py-1.5 text-xs rounded-full border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Remove group
                  </button>
                ) : (
                  <button
                    onClick={() => onRestoreGroup(ids)}
                    className="px-2.5 py-1.5 text-xs rounded-full border border-blue-600 text-blue-600 hover:bg-blue-50"
                  >
                    Restore group
                  </button>
                )}
              </div>
            </header>

            {grp.mergedSpecGroups && grp.mergedSpecGroups.length > 0 && (
              <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-2">
                {grp.mergedSpecGroups.map((sg) => (
                  <span key={sg} className="text-[11px] px-2 py-0.5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">
                    {sg}
                  </span>
                ))}
              </div>
            )}

            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {grp.items.map((b) => {
                const on = included.has(b.id);
                return (
                  <li key={b.id} className="flex items-center justify-between p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{b.board_name || "Untitled board"}</div>
                      <div className="text-xs text-zinc-500 truncate">
                        {b.location || "—"} · {b.width_px ?? "?"}×{b.height_px ?? "?"} px · {fmtFeet(b.width_display)} × {fmtFeet(b.height_display)}
                      </div>
                    </div>
                    <button
                      onClick={() => onToggleBoard(b.id)}
                      className={
                        "px-2.5 py-1.5 text-xs rounded-full border " +
                        (on
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800")
                      }
                    >
                      {on ? "Included" : "Include"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Step 3 subview ---------- */

function Step3Review({
  form,
  selectedCustomer,
  boardsSummary,
  activeGroups,
}: {
  form: Step1Form;
  selectedCustomer?: CustomerRow;
  boardsSummary: string;
  activeGroups: Array<[string, GroupInfo]>;
}) {
  const displayName = [
    form.newCustomer?.firstName,
    form.newCustomer?.lastName,
  ].filter(Boolean).join(" ");

  return (
    <div className="space-y-5">
      <div className="text-sm text-zinc-600 dark:text-zinc-300">
        Review campaign details. When you create the campaign, the client will be asked to upload
        one creative per <strong>pixel spec</strong> below in their portal. We’ll validate each upload against the specs.
      </div>

      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <header className="p-3 bg-zinc-50/60 dark:bg-zinc-900/60 text-sm font-medium">Details</header>
        <div className="p-3 text-sm space-y-2">
          <div><span className="text-zinc-500">Name: </span>{form.name || "—"}</div>
          <div><span className="text-zinc-500">Customer: </span>{selectedCustomer?.name || displayName || "—"}</div>
          <div><span className="text-zinc-500">Dates: </span>{form.startDate || "—"} → {form.endDate || "—"}</div>
          {form.description && <div><span className="text-zinc-500">Notes: </span>{form.description}</div>}
          <div><span className="text-zinc-500">Boards: </span>{boardsSummary}</div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <header className="p-3 bg-zinc-50/60 dark:bg-zinc-900/60 text-sm font-medium">
          Client will upload for these specs ({activeGroups.length})
        </header>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {activeGroups.map(([key, grp]) => {
            const w = grp.width_px ?? "—";
            const h = grp.height_px ?? "—";
            return (
              <li key={key} className="p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-medium">{grp.label}</div>
                    <div className="text-xs text-zinc-500">
                      {grp.items.length} board{grp.items.length === 1 ? "" : "s"} · {w}×{h} px
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full border border-blue-600 text-blue-700">
                    1 creative
                  </span>
                </div>
                {grp.mergedSpecGroups && grp.mergedSpecGroups.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {grp.mergedSpecGroups.map((sg) => (
                      <span key={sg} className="text-[11px] px-2 py-0.5 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">
                        {sg}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/* ---------- helpers ---------- */

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs text-zinc-500">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
    </div>
  );
}

function StepPill({ n, label, active, done }: { n: number; label: string; active?: boolean; done?: boolean }) {
  return (
    <div
      className={
        "hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full text-xs border " +
        (active
          ? "border-blue-600 text-blue-700 bg-blue-50"
          : done
            ? "border-emerald-500 text-emerald-700 bg-emerald-50"
            : "border-zinc-300 text-zinc-500")
      }
    >
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-current text-[10px]">
        {done ? "✓" : n}
      </span>
      <span>{label}</span>
    </div>
  );
}

function fmtFeet(x?: string | null): string {
  if (!x) return "—";
  const s = String(x).trim();
  if (/ft/i.test(s)) return s.replace(/\s*ft\s*$/i, " ft");
  if (/^\d+(\.\d+)?$/.test(s)) return `${s} ft`;
  return s;
}
