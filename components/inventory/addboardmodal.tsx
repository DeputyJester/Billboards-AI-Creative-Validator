import React, { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabaseclient";

/* ---------- Types ---------- */
type InsertBoard = {
    organization_id: string;
    board_name: string | null;
    location: string | null;
    spec_group: string | null;
    width_px: number | null;
    height_px: number | null;
    width_ft: number | null;
    height_ft: number | null;
    width_display: string | null;
    height_display: string | null;
    color_mode: string | null;
    preferred_file_format: string | null;
    supported_file_format: string | null;
    supported_animated_file_format: string | null;
    max_file_size_mb: number | null;
    dpi_min: number | null;
    dpi_max: number | null;
    notes: string | null;
    hero_image_path: string | null;
};

type MinimalBoard = {
    id: string;
    board_name: string | null;
    location: string | null;
    spec_group: string | null;
    width_display: string | null;
    height_display: string | null;
    width_px: number | null;
    height_px: number | null;
    hero_image_path: string | null;
};

/* ---------- Component ---------- */
export default function AddBoardModal({
    open,
    onClose,
    onCreated,
}: {
    open: boolean;
    onClose: () => void;
    onCreated: (row: MinimalBoard) => void;
}) {
    const [orgId, setOrgId] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string>("");

    // hero (optional)
    const [heroFile, setHeroFile] = useState<File | null>(null);
    const [heroPreview, setHeroPreview] = useState<string | null>(null);

    // spec groups
    const [specGroupOptions, setSpecGroupOptions] = useState<string[]>([]);

    // success overlay
    const [successOpen, setSuccessOpen] = useState(false);
    const [justAddedName, setJustAddedName] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            setErr("");
            setHeroFile(null);
            if (heroPreview) URL.revokeObjectURL(heroPreview);
            setHeroPreview(null);
            setForm(initialForm);
            setSpecGroupOptions([]);
            return;
        }
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: memberships } = await supabase
                .from("user_organizations")
                .select("organization_id")
                .eq("user_id", user.id);

            const currentOrgId = memberships?.[0]?.organization_id as string | undefined;
            if (!currentOrgId) return;
            setOrgId(currentOrgId);

            // 1) spec_groups table
            const groupNames = new Set<string>();
            const sg = await supabase
                .from("spec_groups")
                .select("name")
                .eq("organization_id", currentOrgId)
                .order("name", { ascending: true });
            if (!sg.error && sg.data) {
                sg.data.forEach((r: any) => {
                    const n = (r?.name || "").trim();
                    if (n) groupNames.add(n);
                });
            }

            // 2) fallback: distinct boards.spec_group for org
            const bd = await supabase
                .from("boards")
                .select("spec_group")
                .eq("organization_id", currentOrgId);
            if (!bd.error && bd.data) {
                bd.data.forEach((r: any) => {
                    const n = (r?.spec_group || "").trim();
                    if (n) groupNames.add(n);
                });
            }

            const arr = Array.from(groupNames).sort((a, b) => a.localeCompare(b));
            setSpecGroupOptions(arr);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const onPickFile = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const f = files[0];
        if (heroPreview) URL.revokeObjectURL(heroPreview);
        setHeroFile(f);
        setHeroPreview(URL.createObjectURL(f));
    };

    const resetFormAll = () => {
        setForm(initialForm);
        setHeroFile(null);
        if (heroPreview) URL.revokeObjectURL(heroPreview);
        setHeroPreview(null);
        setErr("");
    };

    /* ---------- Form ---------- */
    const initialForm = {
        board_name: "",
        location: "",
        spec_group: "",
        width_px: "",
        height_px: "",
        width_ft: "",
        height_ft: "",
        preferred_file_format: "png",
        supported_file_format: "png,jpg,jpeg",
        supported_animated_file_format: "",
        color_mode: "",
        dpi_min: "",
        dpi_max: "",
        notes: "",
    };
    const [form, setForm] = useState<typeof initialForm>(initialForm);

    const scrubFormats = (s: string) =>
        s
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t && t !== "webp")
            .join(",");

    const readyToSave = useMemo(() => {
        if (!orgId) return false;
        if (!form.board_name.trim()) return false;
        if (!form.location.trim()) return false;

        const wpx = numOrNull(form.width_px);
        const hpx = numOrNull(form.height_px);
        if (!isFiniteNumber(wpx) || !isFiniteNumber(hpx)) return false;

        const wft = numOrNull(form.width_ft);
        const hft = numOrNull(form.height_ft);
        if (!isFiniteNumber(wft) || !isFiniteNumber(hft)) return false;

        if (!form.preferred_file_format.trim()) return false;
        if (!scrubFormats(form.supported_file_format)) return false;

        return true;
    }, [orgId, form]);

    /* ---------- Save (insert-first) ---------- */
    const handleSave = async () => {
        try {
            setSaving(true);
            setErr("");

            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                throw new Error("You must be logged in to add boards.");
            }

            const width_ft_num = numOrNull(form.width_ft);
            const height_ft_num = numOrNull(form.height_ft);
            const width_display = isFiniteNumber(width_ft_num) ? `${width_ft_num} ft` : null;
            const height_display = isFiniteNumber(height_ft_num) ? `${height_ft_num} ft` : null;

            const insertPayload: InsertBoard = {
                organization_id: orgId,
                board_name: textOrNull(form.board_name),
                location: textOrNull(form.location),
                spec_group: textOrNull(form.spec_group) || null,
                width_px: numOrNull(form.width_px),
                height_px: numOrNull(form.height_px),
                width_ft: width_ft_num,
                height_ft: height_ft_num,
                width_display,
                height_display,
                color_mode: textOrNull(form.color_mode),
                preferred_file_format: textOrNull(form.preferred_file_format),
                supported_file_format: scrubFormats(form.supported_file_format) || null,
                supported_animated_file_format: scrubFormats(form.supported_animated_file_format || ""),
                max_file_size_mb: 5,
                dpi_min: numOrNull(form.dpi_min),
                dpi_max: numOrNull(form.dpi_max),
                notes: textOrNull(form.notes),
                hero_image_path: null,
            };

            const { data: inserted, error: insertErr } = await supabase
                .from("boards")
                .insert(insertPayload)
                .select("id, board_name, location, spec_group, width_display, height_display, width_px, height_px, hero_image_path")
                .maybeSingle();

            if (insertErr) throw insertErr;
            if (!inserted?.id) throw new Error("Insert returned no id.");

            onCreated(inserted as MinimalBoard);

            setJustAddedName(inserted.board_name || "Board");
            setSuccessOpen(true);
        } catch (e: any) {
            console.error(e);
            setErr(e?.message || "Failed to add board.");
        } finally {
            setSaving(false);
        }
    };

    /* ---------- UI ---------- */
    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 z-[60] transition ${open ? "bg-black/40" : "pointer-events-none opacity-0"}`}
                onClick={() => { if (!successOpen) onClose(); }}
            />
            {/* modal */}
            <div
                className={`fixed inset-0 z-[61] flex items-center justify-center p-4 ${open ? "" : "pointer-events-none opacity-0"}`}
                aria-hidden={!open}
            >
                <div className="w-full max-w-3xl max-h-[90vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl overflow-hidden flex flex-col">
                    {/* header */}
                    <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                        <h3 className="text-base font-medium">Add billboard</h3>
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm"
                        >
                            Close
                        </button>
                    </div>

                    {/* body */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-5">
                        {/* Hero uploader (optional) */}
                        <section className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
                            <div className="text-sm font-medium mb-1">
                                Hero image <span className="text-xs text-zinc-500">(optional)</span>
                            </div>
                            <div
                                className="rounded-lg bg-zinc-50 dark:bg-zinc-900 h-40 flex items-center justify-center text-sm text-zinc-500 cursor-pointer"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => { e.preventDefault(); onPickFile(e.dataTransfer.files); }}
                                onClick={() => document.getElementById("hero-input")?.click()}
                            >
                                {heroPreview ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={heroPreview} alt="preview" className="h-full w-full object-cover rounded-lg" />
                                ) : (
                                    <div className="text-center">
                                        Drag and drop or click to upload
                                        <div className="text-xs mt-1">PNG · JPG</div>
                                    </div>
                                )}
                            </div>
                            <input
                                id="hero-input"
                                className="hidden"
                                type="file"
                                accept="image/png,image/jpeg"
                                onChange={(e) => onPickFile(e.target.files)}
                            />
                            {heroFile && <div className="text-xs text-zinc-500 mt-2 truncate">{heroFile.name}</div>}
                        </section>

                        {/* Fields */}
                        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Board name" required>
                                    <input
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                        value={form.board_name}
                                        onChange={(e) => setForm((f) => ({ ...f, board_name: e.target.value }))}
                                    />
                                </Field>

                                <Field label="Location" required>
                                    <input
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                        value={form.location}
                                        onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                                    />
                                </Field>

                                {/* Spec group */}
                                <div className="md:col-span-2">
                                    <label className="block text-xs text-zinc-600 mb-1">Spec group</label>
                                    <select
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                        value={form.spec_group}
                                        onChange={(e) => setForm((f) => ({ ...f, spec_group: e.target.value }))}
                                    >
                                        <option value="">— None —</option>
                                        {specGroupOptions.map((name) => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Pixels */}
                                <Field label="Width (px)" required>
                                    <input
                                        inputMode="numeric"
                                        placeholder="e.g. 1920"
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                        value={form.width_px}
                                        onChange={(e) => setForm((f) => ({ ...f, width_px: e.target.value }))}
                                    />
                                </Field>

                                <Field label="Height (px)" required>
                                    <input
                                        inputMode="numeric"
                                        placeholder="e.g. 1080"
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                        value={form.height_px}
                                        onChange={(e) => setForm((f) => ({ ...f, height_px: e.target.value }))}
                                    />
                                </Field>

                                {/* Feet */}
                                <Field label="Width (feet)" required>
                                    <input
                                        inputMode="numeric"
                                        placeholder="e.g. 14"
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                        value={form.width_ft}
                                        onChange={(e) => setForm((f) => ({ ...f, width_ft: e.target.value }))}
                                    />
                                </Field>

                                <Field label="Height (feet)" required>
                                    <input
                                        inputMode="numeric"
                                        placeholder="e.g. 48"
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                        value={form.height_ft}
                                        onChange={(e) => setForm((f) => ({ ...f, height_ft: e.target.value }))}
                                    />
                                </Field>

                                {/* Formats */}
                                <Field label="Preferred file format" required>
                                    <input
                                        placeholder="e.g. png"
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                        value={form.preferred_file_format}
                                        onChange={(e) => setForm((f) => ({ ...f, preferred_file_format: e.target.value }))}
                                    />
                                </Field>

                                <Field label="Supported file formats (comma-separated, no webp)" required>
                                    <input
                                        placeholder="png,jpg,jpeg"
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                        value={form.supported_file_format}
                                        onChange={(e) => setForm((f) => ({ ...f, supported_file_format: scrubFormats(e.target.value) }))}
                                    />
                                </Field>

                                <Field label="Supported animated formats (comma-separated)">
                                    <input
                                        placeholder="gif"
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                        value={form.supported_animated_file_format}
                                        onChange={(e) => setForm((f) => ({ ...f, supported_animated_file_format: scrubFormats(e.target.value) }))}
                                    />
                                </Field>

                                {/* Optional */}
                                <Field label="Color mode">
                                    <input
                                        placeholder="RGB / CMYK"
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                        value={form.color_mode}
                                        onChange={(e) => setForm((f) => ({ ...f, color_mode: e.target.value }))}
                                    />
                                </Field>

                                <Field label="Min DPI">
                                    <input
                                        inputMode="numeric"
                                        placeholder="e.g. 72"
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                        value={form.dpi_min}
                                        onChange={(e) => setForm((f) => ({ ...f, dpi_min: e.target.value }))}
                                    />
                                </Field>

                                <Field label="Max DPI">
                                    <input
                                        inputMode="numeric"
                                        placeholder="e.g. 300"
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                        value={form.dpi_max}
                                        onChange={(e) => setForm((f) => ({ ...f, dpi_max: e.target.value }))}
                                    />
                                </Field>

                                <div className="md:col-span-2">
                                    <label className="block text-xs text-zinc-600 mb-1">Notes</label>
                                    <textarea
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm min-h-[72px]"
                                        value={form.notes}
                                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </section>

                        {err && (
                            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                                {err}
                            </div>
                        )}
                    </div>

                    {/* footer */}
                    <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                        <div className="text-xs text-zinc-600 space-y-1">
                            <div className="flex items-center gap-1">
                                <span className="text-red-600">*</span>
                                <span>Required field</span>
                            </div>
                            <div>Max file size 5 MB</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                className="px-3 py-1.5 rounded-full border border-zinc-300 hover:bg-zinc-100 text-sm"
                                onClick={onClose}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-3 py-1.5 rounded-full border border-blue-600 bg-blue-600 text-white disabled:opacity-50 text-sm shadow"
                                disabled={!readyToSave || saving}
                                onClick={handleSave}
                            >
                                {saving ? "Saving…" : "Add board"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Success overlay */}
            {successOpen && (
                <>
                    <div className="fixed inset-0 z-[70] bg-black/50" onClick={() => setSuccessOpen(false)} />
                    <div className="fixed inset-0 z-[71] flex items-center justify-center p-4">
                        <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl p-5">
                            <div className="flex items-start gap-3">
                                <div className="shrink-0 mt-0.5">
                                    <svg width="24" height="24" viewBox="0 0 24 24" className="opacity-80">
                                        <path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2m-1 14l-4-4l1.414-1.414L11 12.172l5.586-5.586L18 8l-7 8Z" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-base font-semibold">Board added</h4>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                                        {justAddedName ? <><span className="font-medium">{justAddedName}</span> has been added to your inventory.</> : "Your board was added."}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 mt-5">
                                <button
                                    className="px-3 py-1.5 rounded-full border border-zinc-300 hover:bg-zinc-100 text-sm"
                                    onClick={() => { resetFormAll(); setSuccessOpen(false); }}
                                >
                                    Add another
                                </button>
                                <button
                                    className="px-3 py-1.5 rounded-full border border-blue-600 bg-blue-600 text-white text-sm shadow"
                                    onClick={() => { setSuccessOpen(false); onClose(); }}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}

/* ---------- Small UI helpers ---------- */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode; }) {
    return (
        <div className="space-y-1">
            <label className={"block text-xs mb-1 " + (required ? "font-semibold text-zinc-800 dark:text-zinc-200" : "text-zinc-600")}>
                {label} {required && <span className="text-red-600">*</span>}
            </label>
            {children}
        </div>
    );
}
function textOrNull(s: string) { const t = s?.trim(); return t ? t : null; }
function numOrNull(s: string | number) {
    if (s === undefined || s === null || s === "") return null;
    const n = typeof s === "number" ? s : Number(String(s).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
}
function isFiniteNumber(n: number | null): n is number { return typeof n === "number" && Number.isFinite(n); }
