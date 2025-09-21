// components/contracts/contractwizard.tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import supabase from "@/lib/supabaseclient";
import { toast } from "sonner";

const HERO_BUCKET = "board-photos";

type WizardProps = {
    open: boolean;
    onClose: () => void;
    organizationId: string;
    preselectedBoardIds?: string[];
    defaultCustomerId?: string | null;
    onCreated?: (contractId: string, contractNumber?: string) => void;
};

type Board = {
    id: string;
    board_name: string | null;
    location: string | null;
    city: string | null;
    state: string | null;
    spec_group: string | null;
    board_type: string | null;
    width_px: number | null;
    height_px: number | null;
    width_display: string | null;
    height_display: string | null;
    face_direction: string | null;
    geopath_id: string | null;
    hero_image_path: string | null;
    organization_id?: string | null;
};

type Customer = {
    id: string;
    name: string | null;
    email: string | null;
    company?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    billing_email?: string | null;
};

type ItemDraft = {
    boardId: string;
    unitPrice: number;
    qty: number;
    copyChanges: number;
    cycles: number | null;
    description?: string;
    cycleStart?: string | null;
    cycleEnd?: string | null;
};

const Step = { DETAILS: 0, BOARDS: 1, PARTIES: 2, SIGNERS: 3, REVIEW: 4 } as const;
type StepKey = typeof Step[keyof typeof Step];

const clsInput =
    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const clsLabel = "text-[11px] text-gray-500 block mb-1";
const clsBtn = "px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50";
const clsBtnSecondary = "px-4 py-2 rounded-lg border";

function Field(props: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className={clsLabel}>{props.label}</span>
            {props.children}
        </label>
    );
}

export default function ContractWizard({
    open,
    onClose,
    organizationId,
    preselectedBoardIds,
    defaultCustomerId = null,
    onCreated,
}: WizardProps) {
    const [step, setStep] = useState<StepKey>(Step.DETAILS);

    // details
    const [name, setName] = useState("OOHLoop Contract");
    const [startDate, setStartDate] = useState<string>("");
    const [endDate, setEndDate] = useState<string>("");

    // boards
    const [boards, setBoards] = useState<Board[]>([]);
    const [loadingBoards, setLoadingBoards] = useState(false);
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [search, setSearch] = useState("");
    const [filterGroup, setFilterGroup] = useState<string>("all");
    const [filterCity, setFilterCity] = useState<string>("all");
    const [heroUrls, setHeroUrls] = useState<Record<string, string>>({});

    // pricing & per-item fields
    const [itemsDraft, setItemsDraft] = useState<Record<string, ItemDraft>>({});

    // customers
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [customerId, setCustomerId] = useState<string | null>(defaultCustomerId);
    const [newCustomerName, setNewCustomerName] = useState("");
    const [newCustomerEmail, setNewCustomerEmail] = useState("");

    // org & signers
    const [orgName, setOrgName] = useState<string>("");
    const [clientCompany, setClientCompany] = useState<string>("");
    const [clientSignerName, setClientSignerName] = useState("");
    const [clientSignerEmail, setClientSignerEmail] = useState("");
    const [staffSignerName, setStaffSignerName] = useState("");
    const [staffSignerEmail, setStaffSignerEmail] = useState("");

    const [submitting, setSubmitting] = useState(false);

    // keep blank item dates in sync with header dates
    useEffect(() => {
        setItemsDraft((d) => {
            const next = { ...d };
            for (const id of Object.keys(next)) {
                const it = next[id];
                if (!it.cycleStart) next[id] = { ...it, cycleStart: startDate || null };
                if (!it.cycleEnd) next[id] = { ...next[id], cycleEnd: endDate || null };
            }
            return next;
        });
    }, [startDate, endDate]);

    // org name
    useEffect(() => {
        if (!open || !organizationId) return;
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from("organizations")
                .select("name")
                .eq("id", organizationId)
                .maybeSingle();
            if (!cancelled && !error && data) {
                setOrgName(data.name || "Your Organization");
                setStaffSignerName((prev) => prev || data.name || "Staff");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, organizationId]);

    // current user -> staff email
    useEffect(() => {
        (async () => {
            const { data } = await supabase.auth.getUser();
            const u = data?.user;
            if (u?.email) setStaffSignerEmail((prev) => prev || u.email!);
        })();
    }, []);

    // --- helper: fetch boards (always prefer freshest data) ---
    async function fetchBoardsNow() {
        setLoadingBoards(true);
        const { data, error } = await supabase
            .from("boards")
            .select(
                "id,board_name,location,city,state,spec_group,board_type,width_px,height_px,width_display,height_display,face_direction,geopath_id,hero_image_path,organization_id"
            )
            .eq("organization_id", organizationId)
            .order("spec_group", { ascending: true })
            .order("city", { ascending: true });

        if (error) console.error(error);
        const rows = (data ?? []) as Board[];
        setBoards(rows);
        setLoadingBoards(false);

        // seed selection on first open if preselected were passed (only add, never remove)
        if (preselectedBoardIds && preselectedBoardIds.length > 0) {
            setSelected((prev) => {
                const next = { ...prev };
                preselectedBoardIds.forEach((id) => (next[id] = true));
                return next;
            });
        }

        // add default drafts only for boards that don't have one yet
        setItemsDraft((prev) => {
            const next = { ...prev };
            rows.forEach((b) => {
                if (!b.id) return;
                if (!next[b.id]) {
                    next[b.id] = {
                        boardId: b.id,
                        unitPrice: 2500,
                        qty: 1,
                        copyChanges: 0,
                        cycles: null,
                        // prefer board_name then location
                        description: b.board_name || b.location || "Line Item",
                        cycleStart: startDate || null,
                        cycleEnd: endDate || null,
                    };
                }
            });
            return next;
        });
    }

    // fetch when modal opens / org changes
    useEffect(() => {
        if (!open || !organizationId) return;
        fetchBoardsNow();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, organizationId]);

    // fetch again whenever you land on the BOARDS step (keeps names fresh)
    useEffect(() => {
        if (open && step === Step.BOARDS) fetchBoardsNow();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, step]);

    // customers
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from("customers")
                .select("id,name,email,company,first_name,last_name,billing_email,organization_id")
                .eq("organization_id", organizationId)
                .order("name", { ascending: true });
            if (!cancelled) {
                if (error) console.error(error);
                setCustomers(data ?? []);
                if (defaultCustomerId) setCustomerId(defaultCustomerId);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, organizationId, defaultCustomerId]);

    // auto-fill client signer info from selected customer (don’t overwrite edits)
    useEffect(() => {
        if (!open || !customerId) return;
        const c = customers.find((x) => x.id === customerId);
        if (!c) return;
        const fullName =
            c.first_name || c.last_name ? [c.first_name, c.last_name].filter(Boolean).join(" ") : c.name || "";

        setClientCompany((prev) => prev || c.company || c.name || "");
        setClientSignerName((prev) => prev || fullName);
        setClientSignerEmail((prev) => prev || c.billing_email || c.email || "");
    }, [open, customerId, customers]);

    // hero URLs
    useEffect(() => {
        if (!open || boards.length === 0) {
            setHeroUrls({});
            return;
        }
        let cancelled = false;
        (async () => {
            const entries = await Promise.all(
                boards.map(async (b) => {
                    if (!b.hero_image_path) return [b.id, ""] as const;
                    try {
                        const { data, error } = await supabase.storage
                            .from(HERO_BUCKET)
                            .createSignedUrl(b.hero_image_path, 60 * 60);
                        if (error || !data?.signedUrl) return [b.id, ""] as const;
                        return [b.id, `${data.signedUrl}&cb=${Date.now()}`] as const;
                    } catch {
                        return [b.id, ""] as const;
                    }
                })
            );
            if (!cancelled) setHeroUrls(Object.fromEntries(entries));
        })();
        return () => {
            cancelled = true;
        };
    }, [open, boards]);

    // derived
    const filteredBoards = useMemo(() => {
        const q = search.trim().toLowerCase();
        return boards.filter((b) => {
            if (filterGroup !== "all" && (b.spec_group || b.board_type) !== filterGroup) return false;
            if (filterCity !== "all" && [b.city, b.state].filter(Boolean).join(", ") !== filterCity) return false;
            if (!q) return true;
            const hay = [b.board_name, b.location, b.city, b.state, b.spec_group, b.board_type, b.geopath_id]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return hay.includes(q);
        });
    }, [boards, filterGroup, filterCity, search]);

    const selectedBoards = useMemo(
        () => filteredBoards.filter((b) => selected[b.id]),
        [filteredBoards, selected]
    );

    // creativeGroups (examples now prefer board_name)
    const creativeGroups = useMemo(() => {
        const map = new Map<string, { count: number; dims: string; examples: string[] }>();
        selectedBoards.forEach((b) => {
            const key = `${b.width_px || 0}x${b.height_px || 0}`;
            const dims =
                b.width_display && b.height_display
                    ? `${b.height_display} × ${b.width_display}`
                    : `${b.width_px} × ${b.height_px}px`;
            const prev = map.get(key);
            const example = (b.board_name || b.location || "").slice(0, 40);
            if (!prev) {
                map.set(key, {
                    count: 1,
                    dims,
                    examples: [example],
                });
            } else {
                prev.count += 1;
                if (prev.examples.length < 2) prev.examples.push(example);
            }
        });
        return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
    }, [selectedBoards]);

    const subtotal = useMemo(() => {
        return selectedBoards.reduce((sum, b) => {
            const it = itemsDraft[b.id];
            const price = Number(it?.unitPrice ?? 0) * Number(it?.qty ?? 1);
            const extra = Number(it?.copyChanges ?? 0);
            return sum + price + extra;
        }, 0);
    }, [selectedBoards, itemsDraft]);

    function toggle(id: string) {
        setSelected((s) => ({ ...s, [id]: !s[id] }));
    }

    function updateDraft(id: string, patch: Partial<ItemDraft>) {
        setItemsDraft((d) => ({
            ...d,
            [id]: { ...(d[id] ?? { boardId: id, unitPrice: 0, qty: 1, copyChanges: 0, cycles: null }), ...patch },
        }));
    }

    function syncAllItemDates() {
        setItemsDraft((d) => {
            const next = { ...d };
            for (const id of Object.keys(next)) {
                const it = next[id];
                next[id] = { ...it, cycleStart: startDate || null, cycleEnd: endDate || null };
            }
            return next;
        });
    }
    function mismatchCount(items = itemsDraft) {
        let n = 0;
        for (const id of Object.keys(items)) {
            const it = items[id];
            if (!it) continue;
            const a = (it.cycleStart || "") !== (startDate || "");
            const b = (it.cycleEnd || "") !== (endDate || "");
            if (a || b) n++;
        }
        return n;
    }

    const createNewCustomer = async () => {
        if (!newCustomerName || !newCustomerEmail) {
            toast.error("Enter customer name & email");
            return;
        }
        const { data, error } = await supabase
            .from("customers")
            .insert({ organization_id: organizationId, name: newCustomerName, email: newCustomerEmail })
            .select("id")
            .single();
        if (error) {
            console.error(error);
            toast.error("Could not create customer");
            return;
        }
        setCustomerId(data!.id);
        setNewCustomerEmail("");
        setNewCustomerName("");
        toast.success("Customer added");
    };

    const onSubmit = async () => {
        console.log("[ContractWizard] onSubmit clicked");
        toast.message("Submitting contract…");

        if (!customerId) return toast.error("Pick a customer (or add one)");
        if (selectedBoards.length === 0) return toast.error("Select at least one board");
        if (!startDate || !endDate) return toast.error("Choose start & end dates");
        if (!clientSignerEmail) return toast.error("Client signer email required");

        setSubmitting(true);
        try {
            const userRes = await supabase.auth.getUser();
            const user = userRes.data.user;

            const payload = {
                organizationId,
                customerId,
                name,
                startDate,
                endDate,
                items: selectedBoards.map((b) => {
                    const it = itemsDraft[b.id]!;
                    return {
                        boardId: b.id,
                        unitPrice: it.unitPrice ?? 0,
                        qty: it.qty ?? 1,
                        copyChanges: it.copyChanges ?? 0,
                        cycles: it.cycles ?? null,
                        // prefer user-entered description, then board_name, then location
                        description: it.description || b.board_name || b.location || "Line Item",
                        cycleStart: it.cycleStart ?? startDate,
                        cycleEnd: it.cycleEnd ?? endDate,
                    };
                }),
                signerClient: { name: clientSignerName || null, email: clientSignerEmail },
                signerStaff: {
                    name: staffSignerName || orgName || "Staff",
                    email: staffSignerEmail || user?.email || null,
                },
                parties: [
                    {
                        role: "client",
                        company: clientCompany || null,
                        contact_name: clientSignerName || null,
                        email: clientSignerEmail || null,
                    },
                    {
                        role: "staff",
                        company: orgName || null,
                        contact_name: staffSignerName || orgName || null,
                        email: staffSignerEmail || user?.email || null,
                    },
                ],
            };

            console.log("[ContractWizard] POST /api/contracts/create payload:", payload);

            const res = await fetch("/api/contracts/create", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-user-id": user?.id || "",
                    "x-user-email": user?.email || "",
                },
                body: JSON.stringify(payload),
            });

            const text = await res.text();
            console.log("[ContractWizard] /create response status:", res.status, "body:", text?.slice(0, 400));

            let json: any = {};
            try {
                json = text ? JSON.parse(text) : {};
            } catch {
                throw new Error(`Create failed (non-JSON). First bytes: ${text.slice(0, 80)}`);
            }
            if (!res.ok) throw new Error(json.error || `Create failed (HTTP ${res.status})`);

            if (typeof onCreated === "function") onCreated(json.id, json.contract_number);
            toast.success(`Contract ${json.contract_number} created`);
            onClose();
        } catch (e: any) {
            console.error("[ContractWizard] submit error", e);
            toast.error(e.message || "Error creating contract");
            alert(`Create failed: ${e.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    const creativesNeeded = creativeGroups.length;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                className="relative bg-white w-full max-w-5xl rounded-2xl shadow-xl overflow-hidden"
            >
                {/* Header */}
                <div className="p-5 border-b">
                    <h2 className="text-xl font-semibold">Create Contract</h2>
                    <p className="text-xs text-gray-500">Details → Boards → Parties → Signers → Review</p>
                </div>

                {/* Stepper */}
                <div className="px-5 py-3 border-b">
                    <div className="flex items-center gap-2 text-sm">
                        {["Details", "Boards", "Parties", "Signers", "Review"].map((label, i) => (
                            <div key={label} className="flex items-center">
                                <span className={`px-2 py-1 rounded ${i === step ? "bg-indigo-600 text-white" : "bg-gray-100"}`}>{label}</span>
                                {i < 4 && <span className="mx-2 text-gray-300">→</span>}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Body */}
                <div className="p-5 max-h[toy]-[70vh] max-h-[70vh] overflow-auto">
                    {step === Step.DETAILS && (
                        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Contract name">
                                <input className={clsInput} value={name} onChange={(e) => setName(e.target.value)} />
                            </Field>
                            <div className="grid grid-cols-2 gap-4">
                                <Field label="Start date">
                                    <input type="date" className={clsInput} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                                </Field>
                                <Field label="End date">
                                    <input type="date" className={clsInput} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                                </Field>
                            </div>
                            <div className="rounded-xl border p-4 bg-gray-50 md:col-span-2">
                                <div className="text-xs text-gray-500 mb-2">Creative groups preview (by pixel size)</div>
                                <ul className="text-sm space-y-1">
                                    {creativeGroups.length === 0 ? (
                                        <li className="text-gray-500">Will populate after you select boards.</li>
                                    ) : (
                                        creativeGroups.map((g) => (
                                            <li key={g.key} className="flex justify-between">
                                                <span>{g.dims}</span>
                                                <span className="text-gray-500">{g.count} boards</span>
                                            </li>
                                        ))
                                    )}
                                </ul>
                            </div>
                        </section>
                    )}

                    {step === Step.BOARDS && (
                        <section>
                            <div className="flex flex-col md:flex-row gap-3 mb-4">
                                <input
                                    placeholder="Search boards, city, state, GeoPath…"
                                    className={clsInput + " flex-1"}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                                <select className={clsInput} value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
                                    {Array.from(new Set(["all", ...boards.map((b) => b.spec_group || b.board_type || "Other")])).map((g) => (
                                        <option key={g} value={g}>
                                            {g === "all" ? "All groups" : g}
                                        </option>
                                    ))}
                                </select>
                                <select className={clsInput} value={filterCity} onChange={(e) => setFilterCity(e.target.value)}>
                                    {Array.from(
                                        new Set([
                                            "all",
                                            ...boards.map((b) => [b.city, b.state].filter(Boolean).join(", ")).filter(Boolean),
                                        ])
                                    ).map((c) => (
                                        <option key={c} value={c}>
                                            {c === "all" ? "All cities" : c}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {loadingBoards ? (
                                <div className="text-sm text-gray-500">Loading boards…</div>
                            ) : filteredBoards.length === 0 ? (
                                <div className="text-sm text-gray-500">No boards match.</div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredBoards.map((b) => {
                                        const sel = !!selected[b.id];
                                        const it = itemsDraft[b.id];
                                        const img = b.hero_image_path ? heroUrls[b.id] : "";
                                        return (
                                            <div key={b.id} className={`rounded-xl border overflow-hidden ${sel ? "ring-2 ring-indigo-500" : ""}`}>
                                                <div className="aspect-video bg-gray-100 flex items-center justify-center">
                                                    {img ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={img} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-xs text-gray-400">No image</span>
                                                    )}
                                                </div>
                                                <div className="p-3 space-y-2">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            {/* Prefer board_name for the card title */}
                                                            <div className="font-medium truncate">{b.board_name || b.location || "Board"}</div>
                                                            <div className="text-xs text-gray-500">
                                                                {[b.city, b.state].filter(Boolean).join(", ")} · {b.spec_group || b.board_type || "—"}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {b.height_display && b.width_display
                                                                    ? `${b.height_display} × ${b.width_display}`
                                                                    : `${b.height_px}×${b.width_px}px`}
                                                            </div>
                                                            {b.geopath_id && <div className="text-[11px] text-gray-400">GeoPath: {b.geopath_id}</div>}
                                                        </div>
                                                        <input type="checkbox" className="mt-1 h-4 w-4" checked={sel} onChange={() => toggle(b.id)} />
                                                    </div>

                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div>
                                                            <div className={clsLabel}>Price</div>
                                                            <input
                                                                type="number"
                                                                className={clsInput}
                                                                value={it?.unitPrice ?? 0}
                                                                onChange={(e) => updateDraft(b.id, { unitPrice: Number(e.target.value) })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <div className={clsLabel}>Qty</div>
                                                            <input
                                                                type="number"
                                                                className={clsInput}
                                                                value={it?.qty ?? 1}
                                                                onChange={(e) => updateDraft(b.id, { qty: Number(e.target.value) })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <div className={clsLabel}>Cycles</div>
                                                            <input
                                                                type="number"
                                                                className={clsInput}
                                                                value={it?.cycles ?? ""}
                                                                onChange={(e) =>
                                                                    updateDraft(b.id, { cycles: e.target.value === "" ? null : Number(e.target.value) })
                                                                }
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <div className={clsLabel}>Copy changes (additional costs)</div>
                                                            <input
                                                                type="number"
                                                                className={clsInput}
                                                                value={it?.copyChanges ?? 0}
                                                                onChange={(e) => updateDraft(b.id, { copyChanges: Number(e.target.value) })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <div className={clsLabel}>Desc</div>
                                                            <input
                                                                className={clsInput}
                                                                value={it?.description ?? ""}
                                                                onChange={(e) => updateDraft(b.id, { description: e.target.value })}
                                                                placeholder={b.board_name || b.location || "Line Item"}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    )}

                    {step === Step.PARTIES && (
                        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <h3 className="font-semibold">Customer</h3>
                                <select
                                    className={clsInput + " w-full"}
                                    value={customerId ?? ""}
                                    onChange={(e) => setCustomerId(e.target.value || null)}
                                >
                                    <option value="">Select…</option>
                                    {customers.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name || c.email || c.id}
                                        </option>
                                    ))}
                                </select>

                                <div className="text-xs text-gray-500">or quick-add</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        className={clsInput}
                                        placeholder="Customer name"
                                        value={newCustomerName}
                                        onChange={(e) => setNewCustomerName(e.target.value)}
                                    />
                                    <input
                                        className={clsInput}
                                        placeholder="Customer email"
                                        value={newCustomerEmail}
                                        onChange={(e) => setNewCustomerEmail(e.target.value)}
                                    />
                                </div>
                                <button className={clsBtnSecondary} onClick={createNewCustomer}>
                                    Add customer
                                </button>
                            </div>

                            <div className="space-y-3">
                                <h3 className="font-semibold">Dates</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="date"
                                        className={clsInput}
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                    />
                                    <input
                                        type="date"
                                        className={clsInput}
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                    />
                                </div>

                                <div className="rounded-xl border p-3 bg-gray-50">
                                    <div className="text-xs text-gray-500 mb-1">Creative groups (auto from selection)</div>
                                    <ul className="text-sm space-y-1">
                                        {creativeGroups.length === 0 ? (
                                            <li className="text-gray-500">No boards selected.</li>
                                        ) : (
                                            creativeGroups.map((g) => (
                                                <li key={g.key} className="flex justify-between">
                                                    <span>
                                                        {g.dims} <span className="text-gray-400">({g.examples.join(" · ")})</span>
                                                    </span>
                                                    <span className="text-gray-500">{g.count}</span>
                                                </li>
                                            ))
                                        )}
                                    </ul>
                                </div>
                            </div>
                        </section>
                    )}

                    {step === Step.SIGNERS && (
                        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <h3 className="font-semibold">Client signer</h3>
                                <Field label="Client company (auto-filled from customer; editable)">
                                    <input
                                        className={clsInput}
                                        placeholder="Company"
                                        value={clientCompany}
                                        onChange={(e) => setClientCompany(e.target.value)}
                                    />
                                </Field>
                                <Field label="Client name (auto-filled; editable)">
                                    <input
                                        className={clsInput}
                                        placeholder="Client name"
                                        value={clientSignerName}
                                        onChange={(e) => setClientSignerName(e.target.value)}
                                    />
                                </Field>
                                <Field label="Client email (auto-filled; editable)">
                                    <input
                                        className={clsInput}
                                        placeholder="Client email"
                                        value={clientSignerEmail}
                                        onChange={(e) => setClientSignerEmail(e.target.value)}
                                    />
                                </Field>
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-semibold">Staff signer</h3>
                                <Field label="Staff company">
                                    <input className={clsInput} value={orgName} readOnly />
                                </Field>
                                <Field label="Staff signer name">
                                    <input
                                        className={clsInput}
                                        placeholder="Staff signer name"
                                        value={staffSignerName}
                                        onChange={(e) => setStaffSignerName(e.target.value)}
                                    />
                                </Field>
                                <Field label="Staff email">
                                    <input
                                        className={clsInput}
                                        placeholder="Staff email"
                                        value={staffSignerEmail}
                                        onChange={(e) => setStaffSignerEmail(e.target.value)}
                                    />
                                </Field>
                            </div>
                        </section>
                    )}

                    {step === Step.REVIEW && (
                        <section className="space-y-4">
                            {mismatchCount() > 0 && (
                                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 mb-1 text-sm text-yellow-800 flex items-center justify-between">
                                    <span>
                                        {mismatchCount()} line item{mismatchCount() === 1 ? "" : "s"} don’t match the contract dates.
                                    </span>
                                    <button onClick={syncAllItemDates} className="px-3 py-1.5 rounded-md bg-yellow-600 text-white">
                                        Sync all to {startDate || "—"} – {endDate || "—"}
                                    </button>
                                </div>
                            )}

                            <div className="rounded-xl border p-4">
                                <div className="text-xs text-gray-500 mb-2">Summary</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <span className="text-gray-500">Name:</span> {name}
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Dates:</span> {fmtDate(startDate)} – {fmtDate(endDate)}
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Customer:</span>{" "}
                                        {customers.find((c) => c.id === customerId)?.name || "—"}
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Boards:</span> {selectedBoards.length}
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Creatives needed:</span> {creativesNeeded}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-gray-500">Line items (pricing preview)</div>
                                    <div className="text-sm font-semibold">{fmtMoney(subtotal)}</div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Desc</th>
                                                <th className="px-3 py-2 text-left">Market</th>
                                                <th className="px-3 py-2 text-left">Format</th>
                                                <th className="px-3 py-2 text-right">Qty</th>
                                                <th className="px-3 py-2 text-right">Net media</th>
                                                <th className="px-3 py-2 text-right">Additional</th>
                                                <th className="px-3 py-2 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedBoards.map((b) => {
                                                const it = itemsDraft[b.id];
                                                const net = (it?.unitPrice ?? 0) * (it?.qty ?? 1);
                                                const add = it?.copyChanges ?? 0;
                                                return (
                                                    <tr key={b.id} className="border-t">
                                                        <td className="px-3 py-2">{it?.description || b.board_name || b.location}</td>
                                                        <td className="px-3 py-2">{[(b.city || ""), (b.state || "")].filter(Boolean).join(", ")}</td>
                                                        <td className="px-3 py-2">{b.spec_group || b.board_type || "—"}</td>
                                                        <td className="px-3 py-2 text-right">{it?.qty ?? 1}</td>
                                                        <td className="px-3 py-2 text-right">{fmtMoney(net)}</td>
                                                        <td className="px-3 py-2 text-right">{fmtMoney(add)}</td>
                                                        <td className="px-3 py-2 text-right">{fmtMoney(net + add)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                        {step === Step.BOARDS && (
                            <span>
                                {Object.values(selected).filter(Boolean).length} selected · {creativeGroups.length} creative{" "}
                                {creativeGroups.length === 1 ? "group" : "groups"}
                            </span>
                        )}
                        {step === Step.REVIEW && <span>Subtotal: {fmtMoney(subtotal)}</span>}
                    </div>

                    <div className="flex items-center gap-2">
                        <button className={clsBtnSecondary} onClick={onClose}>
                            Cancel
                        </button>
                        {step > Step.DETAILS && (
                            <button className={clsBtnSecondary} onClick={() => setStep((s) => (s - 1) as StepKey)}>
                                Back
                            </button>
                        )}
                        {step < Step.REVIEW && (
                            <button className={clsBtn} onClick={() => setStep((s) => (s + 1) as StepKey)}>
                                Next
                            </button>
                        )}
                        {step === Step.REVIEW && (
                            <button className={clsBtn} onClick={onSubmit} disabled={submitting}>
                                {submitting ? "Creating…" : "Create contract"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function fmtMoney(n?: number | null) {
    if (typeof n !== "number") return "$0.00";
    return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function fmtDate(s?: string) {
    if (!s) return "—";
    const d = new Date(s);
    return d.toLocaleDateString();
}
