// components/inventory/boarddetailsmodal.tsx
import React, { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabaseclient";
import { toast } from "sonner";
import { BOARD_TYPE_OPTIONS, FACE_DIRECTION_OPTIONS, FACE_READ_OPTIONS } from "@/lib/boardconstants";

/* ---------- Types ---------- */
export type Board = {
    id: string;
    organization_id?: string;
    board_name?: string | null;
    location?: string | null;
    spec_group?: string | null;
    width_px?: number | null;
    height_px?: number | null;
    width_ft?: number | null;
    height_ft?: number | null;
    width_display?: string | null;
    height_display?: string | null;
    color_mode?: string | null;
    preferred_file_format?: string | null;
    supported_file_format?: string | null;
    supported_animated_file_format?: string | null;
    dpi_min?: number | null;
    dpi_max?: number | null;
    notes?: string | null;
    hero_image_path?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    latitude_display?: string | null;
    longitude_display?: string | null;
    city?: string | null;
    state?: string | null;
    zipcode?: string | null;
    county?: string | null;
    face_direction?: string | null;
    face_read?: string | null;
    geopath_id?: string | null;
    board_type?: string | null;
};

type Props = {
    open: boolean;
    onClose: () => void;
    orgId: string;
    board: Board | null;
    onSaved?: (updated: Partial<Board> & { id: string }) => void;
};

/* ---------- Utils ---------- */
const MAX_FILE_MB = 5;
const BYTES_PER_MB = 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg"]);
const ALLOWED_EXT = new Set(["png", "jpg", "jpeg"]);

function textOrNull(s: string | number | null | undefined) {
    const t = (s ?? "").toString().trim();
    return t ? t : null;
}
function formatMB(bytes: number) {
    return `${(bytes / BYTES_PER_MB).toFixed(2)} MB`;
}
function numOrNull(s: string | number | null | undefined) {
    if (s === undefined || s === null || s === "") return null;
    const n = typeof s === "number" ? s : Number(String(s).replace(/[^\d.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
}
function isFiniteNumber(n: number | null | undefined): n is number {
    return typeof n === "number" && Number.isFinite(n);
}
function feetDisplay(n: number | null | undefined): string | null {
    return isFiniteNumber(n) ? `${n} ft` : null;
}
function latDisp(n: number | null | undefined): string | null {
    return isFiniteNumber(n) ? n.toFixed(6) : null;
}
function lngDisp(n: number | null | undefined): string | null {
    return isFiniteNumber(n) ? n.toFixed(6) : null;
}
function scrubFormats(s: string | null | undefined) {
    return (s || "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t && t !== "webp")
        .join(",");
}
function normalizeState(v: string | null | undefined) {
    const s = (v ?? "").trim().toUpperCase();
    return s ? s.slice(0, 2) : null;
}
function normalizeZip(v: string | null | undefined) {
    const raw = (v ?? "").trim();
    const digits = raw.replace(/[^\d-]/g, "");
    return digits || null;
}
function normalizeFaceDirection(v: string | null | undefined) {
    const s = (v ?? "").trim().toUpperCase();
    const allowed = new Set(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
    return s && allowed.has(s) ? s : s || null;
}
function normalizeFaceRead(v: string | null | undefined) {
    const s = (v ?? "").trim().toUpperCase();
    if (s === "LHR" || s === "LEFT" || s === "LEFT HAND READ") return "LHR";
    if (s === "RHR" || s === "RIGHT" || s === "RIGHT HAND READ") return "RHR";
    return s || null;
}
// Try to parse "14 ft" or `15' 6"` into a decimal feet number
function parseFeetFromDisplay(s?: string | null): number | null {
    if (!s) return null;
    const str = String(s).trim();
    // 15' 6" style
    const m = str.match(/^\s*(\d+)\s*'\s*(\d+)?/);
    if (m) {
        const feet = parseInt(m[1], 10);
        const inches = m[2] ? parseInt(m[2], 10) : 0;
        return Number.isFinite(feet) ? +(feet + inches / 12).toFixed(2) : null;
    }
    // 14 ft / 14.5 ft / 14
    const n = Number(str.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? +n.toFixed(2) : null;
}

/* ---------- Component ---------- */
export default function BoardDetailsModal({ open, onClose, orgId, board, onSaved }: Props) {
    const [tab, setTab] = useState<"image" | "details">("image");

    // Full row (so fields always populate)
    const [loadingFull, setLoadingFull] = useState(false);
    const [full, setFull] = useState<Board | null>(null);
    const current = full || board;

    // Dropdown options
    const [specGroupOptions, setSpecGroupOptions] = useState<string[]>([]);
    const [boardTypeOptions, setBoardTypeOptions] = useState<string[]>([]);

    // IMAGE
    const heroPath = current?.hero_image_path || null;
    const [currentSignedUrl, setCurrentSignedUrl] = useState<string | null>(null);
    const [loadingCurrent, setLoadingCurrent] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [fileErr, setFileErr] = useState<string>("");
    const [uploading, setUploading] = useState(false);

    // DETAILS
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string>("");

    const [form, setForm] = useState({
        board_name: "",
        location: "",
        spec_group: "",
        geopath_id: "",
        width_px: "",
        height_px: "",
        width_ft: "",
        height_ft: "",
        color_mode: "",
        preferred_file_format: "png",
        supported_file_format: "png,jpg,jpeg",
        supported_animated_file_format: "",
        dpi_min: "",
        dpi_max: "",
        notes: "",
        // location/orientation
        city: "",
        state: "",
        zipcode: "",
        county: "",
        latitude: "",
        longitude: "",
        face_direction: "",
        face_read: "",
        board_type: "",
    });

    /* ---------- Load the full board row when modal opens ---------- */
    useEffect(() => {
        if (!open || !board?.id) return;
        let active = true;
        (async () => {
            try {
                setLoadingFull(true);
                const { data, error } = await supabase
                    .from("boards")
                    .select(`
            id, organization_id,
            board_name, location, spec_group, geopath_id,
            width_px, height_px, width_ft, height_ft, width_display, height_display,
            color_mode, preferred_file_format, supported_file_format, supported_animated_file_format,
            dpi_min, dpi_max, notes, hero_image_path,
            latitude, longitude, latitude_display, longitude_display,
            city, state, zipcode, county,
            face_direction, face_read, board_type
          `)
                    .eq("id", board.id)
                    .maybeSingle();

                if (!active) return;
                if (!error && data) setFull(data as Board);
            } finally {
                if (active) setLoadingFull(false);
            }
        })();
        return () => {
            active = false;
        };
    }, [open, board?.id]);

    /* ---------- Seed the form from the loaded/current row ---------- */
    useEffect(() => {
        if (!open) return;
        const src = current;
        if (!src) return;

        const numToStr = (n: number | null | undefined) =>
            typeof n === "number" && Number.isFinite(n) ? String(n) : "";

        setForm({
            board_name: src.board_name ?? "",
            location: src.location ?? "",
            spec_group: src.spec_group ?? "",
            geopath_id: src.geopath_id ?? "",
            width_px: numToStr(src.width_px),
            height_px: numToStr(src.height_px),
            // fall back to parsing display feet if numeric ft are missing
            width_ft:
                numToStr(src.width_ft) ||
                (parseFeetFromDisplay(src.width_display) != null
                    ? String(parseFeetFromDisplay(src.width_display))
                    : ""),
            height_ft:
                numToStr(src.height_ft) ||
                (parseFeetFromDisplay(src.height_display) != null
                    ? String(parseFeetFromDisplay(src.height_display))
                    : ""),
            color_mode: src.color_mode ?? "",
            preferred_file_format: src.preferred_file_format ?? "png",
            supported_file_format: src.supported_file_format ?? "png,jpg,jpeg",
            supported_animated_file_format: src.supported_animated_file_format ?? "",
            dpi_min: numToStr(src.dpi_min),
            dpi_max: numToStr(src.dpi_max),
            notes: src.notes ?? "",
            city: src.city ?? "",
            state: src.state ?? "",
            zipcode: src.zipcode ?? "",
            county: src.county ?? "",
            latitude: numToStr(src.latitude),
            longitude: numToStr(src.longitude),
            face_direction: src.face_direction ?? "",
            face_read: src.face_read ?? "",
            board_type: src.board_type ?? "",
        });
    }, [open, current?.id]); // re-seed whenever we load a different row

    // Load dropdown options for this org
    useEffect(() => {
        let active = true;
        (async () => {
            if (!open || !orgId) return;

            const BASELINE_TYPES = [
                "Bulletin",
                "Poster",
                "Digital",
                "Static",
                "Wallscape",
                "Transit",
                "Mobile",
            ];

            const groupNames = new Set<string>();
            const types = new Set<string>(BASELINE_TYPES);

            // spec_groups: names + board_type
            const sg = await supabase
                .from("spec_groups")
                .select("name, board_type")
                .eq("organization_id", orgId)
                .order("name", { ascending: true });
            if (!sg.error && sg.data) {
                sg.data.forEach((r: any) => {
                    const n = (r?.name || "").trim();
                    if (n) groupNames.add(n);
                    const bt = (r?.board_type || "").trim();
                    if (bt) types.add(bt);
                });
            }

            // fallback: distinct boards.spec_group + boards.board_type
            const bd = await supabase
                .from("boards")
                .select("spec_group, board_type")
                .eq("organization_id", orgId);
            if (!bd.error && bd.data) {
                bd.data.forEach((r: any) => {
                    const n = (r?.spec_group || "").trim();
                    if (n) groupNames.add(n);
                    const bt = (r?.board_type || "").trim();
                    if (bt) types.add(bt);
                });
            }

            // include current values
            if (current?.spec_group) groupNames.add(current.spec_group);
            if (current?.board_type) types.add(current.board_type);

            if (!active) return;
            setSpecGroupOptions(Array.from(groupNames).sort((a, b) => a.localeCompare(b)));
            setBoardTypeOptions(Array.from(types).sort((a, b) => a.localeCompare(b)));
        })();
        return () => {
            active = false;
        };
    }, [open, orgId, current?.spec_group, current?.board_type]);

    /* ---------- Signed URL for current hero ---------- */
    useEffect(() => {
        let active = true;
        (async () => {
            if (!open) return;
            setLoadingCurrent(true);
            if (!heroPath) {
                if (active) setCurrentSignedUrl(null);
                setLoadingCurrent(false);
                return;
            }
            const { data, error } = await supabase.storage
                .from("board-photos")
                .createSignedUrl(heroPath, 60 * 60);
            if (!active) return;
            if (error || !data?.signedUrl) setCurrentSignedUrl(null);
            else setCurrentSignedUrl(data.signedUrl);
            setLoadingCurrent(false);
        })();
        return () => {
            active = false;
        };
    }, [open, heroPath]);

    /* ---------- Derived displays ---------- */
    const widthDisplay = useMemo(
        () => feetDisplay(numOrNull(form.width_ft)) ?? (current?.width_display ?? "—"),
        [form.width_ft, current?.width_display]
    );
    const heightDisplay = useMemo(
        () => feetDisplay(numOrNull(form.height_ft)) ?? (current?.height_display ?? "—"),
        [form.height_ft, current?.height_display]
    );
    const latitudeDisplay = useMemo(
        () => latDisp(numOrNull(form.latitude)) ?? (current?.latitude_display ?? "—"),
        [form.latitude, current?.latitude_display]
    );
    const longitudeDisplay = useMemo(
        () => lngDisp(numOrNull(form.longitude)) ?? (current?.longitude_display ?? "—"),
        [form.longitude, current?.longitude_display]
    );

    /* ---------- Image pick & upload ---------- */
    const onPickFile = (files: FileList | null) => {
        setFileErr("");
        if (!files || files.length === 0) return;
        const f = files[0];
        const ext = (f.name.split(".").pop() || "").toLowerCase();
        if (!ALLOWED_MIME.has(f.type) || !ALLOWED_EXT.has(ext)) {
            setFileErr("Please upload a PNG or JPG image.");
            return;
        }
        if (f.size > MAX_FILE_MB * BYTES_PER_MB) {
            setFileErr(`Max file size is ${MAX_FILE_MB} MB.`);
            return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setFile(f);
        setPreviewUrl(URL.createObjectURL(f));
    };
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    const readyToUpload = useMemo(() => {
        if (!open || !current?.id || !orgId) return false;
        if (!file || fileErr) return false;
        return true;
    }, [open, current?.id, orgId, file, fileErr]);

    const usagePct = file ? Math.min(100, Math.round((file.size / (MAX_FILE_MB * BYTES_PER_MB)) * 100)) : 0;
    const usageBarColor =
        usagePct < 70 ? "bg-green-500" : usagePct < 90 ? "bg-amber-500" : "bg-red-500";

    const doUpload = async () => {
        if (!current?.id) return;
        try {
            setErr("");
            setUploading(true);

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("You must be logged in to replace images.");

            const extRaw = (file!.name.split(".").pop() || "jpg").toLowerCase();
            const ext = ALLOWED_EXT.has(extRaw) ? extRaw : "jpg";
            const heroName = `hero.${ext}`;
            const newPath = `org_${orgId}/boards/${current.id}/${heroName}`;

            const { error: upErr } = await supabase.storage
                .from("board-photos")
                .upload(newPath, file!, { contentType: file!.type || "application/octet-stream", upsert: true });
            if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

            const { data: updated, error: updErr } = await supabase
                .from("boards")
                .update({ hero_image_path: newPath })
                .eq("id", current.id)
                .select("id, hero_image_path")
                .maybeSingle();
            if (updErr) throw updErr;

            const { data: signed } = await supabase.storage
                .from("board-photos")
                .createSignedUrl(newPath, 60 * 60);
            setCurrentSignedUrl(signed?.signedUrl || null);

            setFull((prev) => (prev ? { ...prev, hero_image_path: newPath } : prev));
            onSaved?.({ id: current.id, hero_image_path: newPath });

            setFile(null);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);

            toast.success("✅ Image updated");
        } catch (e: any) {
            setErr(e?.message || "Failed to replace image.");
        } finally {
            setUploading(false);
        }
    };

    /* ---------- Save details ---------- */
    const readyToSave = useMemo(() => {
        if (!current?.id) return false;
        if (!form.board_name.trim()) return false;
        if (!form.location.trim()) return false;

        const wpx = numOrNull(form.width_px);
        const hpx = numOrNull(form.height_px);
        const wft = numOrNull(form.width_ft);
        const hft = numOrNull(form.height_ft);
        if (![wpx, hpx, wft, hft].every(isFiniteNumber)) return false;

        if (!form.preferred_file_format.trim()) return false;
        if (!scrubFormats(form.supported_file_format)) return false;

        return true;
    }, [current?.id, form]);

    const doSave = async () => {
        if (!current?.id) return;
        try {
            setSaving(true);
            setErr("");

            const lat = numOrNull(form.latitude);
            const lng = numOrNull(form.longitude);

            const payload: Partial<Board> = {
                board_name: textOrNull(form.board_name),
                location: textOrNull(form.location),
                spec_group: textOrNull(form.spec_group),
                geopath_id: textOrNull(form.geopath_id),
                width_px: numOrNull(form.width_px),
                height_px: numOrNull(form.height_px),
                width_ft: numOrNull(form.width_ft),
                height_ft: numOrNull(form.height_ft),
                color_mode: textOrNull(form.color_mode),
                preferred_file_format: textOrNull(form.preferred_file_format),
                supported_file_format: scrubFormats(form.supported_file_format) || null,
                supported_animated_file_format: scrubFormats(form.supported_animated_file_format || "") || null,
                dpi_min: numOrNull(form.dpi_min),
                dpi_max: numOrNull(form.dpi_max),
                notes: textOrNull(form.notes),
                city: textOrNull(form.city),
                state: normalizeState(form.state),
                zipcode: normalizeZip(form.zipcode),
                county: textOrNull(form.county),
                latitude: lat,
                longitude: lng,
                latitude_display: latDisp(lat),
                longitude_display: lngDisp(lng),
                face_direction: normalizeFaceDirection(form.face_direction),
                face_read: normalizeFaceRead(form.face_read),
                board_type: textOrNull(form.board_type),
            };

            const { data, error } = await supabase
                .from("boards")
                .update(payload)
                .eq("id", current.id)
                .select(`
          id, organization_id,
          board_name, location, spec_group, geopath_id,
          width_px, height_px, width_ft, height_ft, width_display, height_display,
          color_mode, preferred_file_format, supported_file_format, supported_animated_file_format,
          dpi_min, dpi_max, notes, hero_image_path,
          latitude, longitude, latitude_display, longitude_display,
          city, state, zipcode, county,
          face_direction, face_read, board_type
        `)
                .maybeSingle();

            if (error) throw error;

            setFull((prev) => (prev ? { ...prev, ...(data as Board) } : (data as Board)));
            onSaved?.(data as Board);

            toast.success("✅ Changes saved");
        } catch (e: any) {
            setErr(e?.message || "Failed to save changes.");
        } finally {
            setSaving(false);
        }
    };

    /* ---------- UI ---------- */
    return (
        <>
            <div
                className={`fixed inset-0 z-[90] transition ${open ? "bg-black/40" : "pointer-events-none opacity-0"}`}
                onClick={() => { if (!uploading && !saving) onClose(); }}
            />
            <div
                className={`fixed inset-0 z-[91] flex items-center justify-center p-4 ${open ? "" : "pointer-events-none opacity-0"}`}
                aria-hidden={!open}
            >
                <div className="w-full max-w-4xl max-h-[92vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-white/70 to-white/40 dark:from-zinc-950/70 dark:to-zinc-950/40 backdrop-blur flex items-center justify-between">
                        <div className="min-w-0">
                            <h3 className="text-base font-medium">Edit board</h3>
                            <div className="text-xs text-zinc-500 truncate">
                                {(current?.board_name || "Untitled board") + (loadingFull ? " • loading…" : "")}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm"
                            disabled={uploading || saving}
                        >
                            Close
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="px-5 pt-3">
                        <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                            <TabButton active={tab === "image"} onClick={() => setTab("image")}>Image</TabButton>
                            <TabButton active={tab === "details"} onClick={() => setTab("details")}>Details</TabButton>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-5">
                        {tab === "image" ? (
                            <div className="space-y-6">
                                {/* Current */}
                                <section>
                                    <div className="text-sm font-medium mb-2">Current image</div>
                                    <div className="relative h-40 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800/70 shadow-inner overflow-hidden">
                                        <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-white/40 dark:ring-black/30" />
                                        {loadingCurrent ? (
                                            <div className="h-full w-full flex items-center justify-center text-xs text-zinc-500">Loading…</div>
                                        ) : currentSignedUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={currentSignedUrl} alt="Current" className="h-40 w-full object-cover" />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center text-xs text-zinc-400">No image</div>
                                        )}
                                    </div>
                                </section>

                                {/* New */}
                                <section>
                                    <div className="text-sm font-medium mb-2">
                                        New image <span className="text-xs text-zinc-500">(PNG/JPG ≤ {MAX_FILE_MB} MB)</span>
                                    </div>

                                    <div className="relative">
                                        <div
                                            className={
                                                "relative rounded-lg bg-zinc-50 dark:bg-zinc-900 h-44 flex items-center justify-center text-sm text-zinc-500 cursor-pointer " +
                                                "border border-dashed border-zinc-300 dark:border-zinc-700 " +
                                                (uploading ? "pointer-events-none opacity-80" : "")
                                            }
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => { e.preventDefault(); onPickFile(e.dataTransfer.files); }}
                                            onClick={() => document.getElementById("edit-hero-input")?.click()}
                                        >
                                            <div className="pointer-events-none absolute inset-1 rounded-md ring-1 ring-zinc-900/5 dark:ring-white/10" />
                                            {previewUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={previewUrl} alt="Preview" className="h-44 w-full object-cover rounded-lg" />
                                            ) : (
                                                <div className="text-center">
                                                    Drag and drop or click to upload
                                                    <div className="text-xs mt-1">PNG · JPG</div>
                                                </div>
                                            )}
                                        </div>

                                        {uploading && (
                                            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30">
                                                <div className="px-3 py-1.5 text-xs rounded-full bg-white dark:bg-zinc-8 00 border border-zinc-200 dark:border-zinc-700 shadow">
                                                    Uploading…
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <input
                                        id="edit-hero-input"
                                        className="hidden"
                                        type="file"
                                        accept="image/png,image/jpeg"
                                        onChange={(e) => onPickFile(e.target.files)}
                                    />

                                    {file && (
                                        <>
                                            <div className="flex items-center gap-3 mt-2">
                                                <div className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{file.name}</div>
                                                <div className="text-[11px] px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                                                    {formatMB(file.size)} / {MAX_FILE_MB}.00 MB
                                                </div>
                                            </div>
                                            <div className="w-full h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden mt-1">
                                                <div className={`h-full ${usageBarColor}`} style={{ width: `${usagePct}%` }} />
                                            </div>
                                        </>
                                    )}
                                    {fileErr && <div className="mt-2 text-xs text-red-600">{fileErr}</div>}

                                    {err && (
                                        <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                                            {err}
                                        </div>
                                    )}
                                </section>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Basics */}
                                <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Field label="Board name" required>
                                            <Input value={form.board_name} onChange={(v) => setForm((f) => ({ ...f, board_name: v }))} disabled={loadingFull} />
                                        </Field>
                                        <Field label="Location" required>
                                            <Input value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))} disabled={loadingFull} />
                                        </Field>

                                        <Field label="Spec group">
                                            <SelectOrInput
                                                value={form.spec_group}
                                                onChange={(v) => setForm((f) => ({ ...f, spec_group: v }))}
                                                options={specGroupOptions}
                                                disabled={loadingFull}
                                                placeholder="— Select —"
                                            />
                                        </Field>
                                        <Field label="GeoPath ID">
                                            <Input value={form.geopath_id} onChange={(v) => setForm((f) => ({ ...f, geopath_id: v }))} disabled={loadingFull} />
                                        </Field>
                                    </div>
                                </section>

                                {/* Sizes */}
                                <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Field label="Width (px)" required>
                                            <NumberInput value={form.width_px} onChange={(v) => setForm((f) => ({ ...f, width_px: v }))} placeholder="e.g. 1920" disabled={loadingFull} />
                                        </Field>
                                        <Field label="Height (px)" required>
                                            <NumberInput value={form.height_px} onChange={(v) => setForm((f) => ({ ...f, height_px: v }))} placeholder="e.g. 1080" disabled={loadingFull} />
                                        </Field>

                                        <Field label="Width (feet)" required>
                                            <NumberInput value={form.width_ft} onChange={(v) => setForm((f) => ({ ...f, width_ft: v }))} placeholder="e.g. 14" disabled={loadingFull} />
                                        </Field>
                                        <Field label="Height (feet)" required>
                                            <NumberInput value={form.height_ft} onChange={(v) => setForm((f) => ({ ...f, height_ft: v }))} placeholder="e.g. 48" disabled={loadingFull} />
                                        </Field>

                                        <ReadRow label="Feet (display)" value={`${widthDisplay ?? "—"} × ${heightDisplay ?? "—"}`} />
                                    </div>
                                </section>

                                {/* Formats / Color / DPI */}
                                <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Field label="Preferred file format" required>
                                            <Input value={form.preferred_file_format} onChange={(v) => setForm((f) => ({ ...f, preferred_file_format: v }))} disabled={loadingFull} />
                                        </Field>
                                        <Field label="Supported file formats (comma-separated, no webp)" required>
                                            <Input value={form.supported_file_format} onChange={(v) => setForm((f) => ({ ...f, supported_file_format: v }))} placeholder="png,jpg,jpeg" disabled={loadingFull} />
                                        </Field>
                                        <Field label="Supported animated formats (comma-separated)">
                                            <Input value={form.supported_animated_file_format} onChange={(v) => setForm((f) => ({ ...f, supported_animated_file_format: v }))} placeholder="gif" disabled={loadingFull} />
                                        </Field>
                                        <Field label="Color mode">
                                            <Input value={form.color_mode} onChange={(v) => setForm((f) => ({ ...f, color_mode: v }))} placeholder="RGB / CMYK" disabled={loadingFull} />
                                        </Field>
                                        <Field label="Min DPI">
                                            <NumberInput value={form.dpi_min} onChange={(v) => setForm((f) => ({ ...f, dpi_min: v }))} placeholder="e.g. 72" disabled={loadingFull} />
                                        </Field>
                                        <Field label="Max DPI">
                                            <NumberInput value={form.dpi_max} onChange={(v) => setForm((f) => ({ ...f, dpi_max: v }))} placeholder="e.g. 300" disabled={loadingFull} />
                                        </Field>
                                    </div>
                                </section>

                                {/* Location & Orientation */}
                                <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Field label="City">
                                            <Input value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} disabled={loadingFull} />
                                        </Field>
                                        <Field label="State (2-letter)">
                                            <Input value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} disabled={loadingFull} />
                                        </Field>
                                        <Field label="Zipcode">
                                            <Input value={form.zipcode} onChange={(v) => setForm((f) => ({ ...f, zipcode: v }))} disabled={loadingFull} />
                                        </Field>
                                        <Field label="County">
                                            <Input value={form.county} onChange={(v) => setForm((f) => ({ ...f, county: v }))} disabled={loadingFull} />
                                        </Field>

                                        <Field label="Latitude">
                                            <NumberInput value={form.latitude} onChange={(v) => setForm((f) => ({ ...f, latitude: v }))} placeholder="e.g. 36.1716" disabled={loadingFull} />
                                        </Field>
                                        <Field label="Longitude">
                                            <NumberInput value={form.longitude} onChange={(v) => setForm((f) => ({ ...f, longitude: v }))} placeholder="-115.1391" disabled={loadingFull} />
                                        </Field>

                                        <ReadRow label="Coords (display)" value={`${latitudeDisplay ?? "—"}, ${longitudeDisplay ?? "—"}`} />

                                        <Field label="Face direction">
                                            <SelectFixed
                                                value={form.face_direction}
                                                onChange={(v) => setForm((f) => ({ ...f, face_direction: v }))}
                                                options={["", "N", "NE", "E", "SE", "S", "SW", "W", "NW"]}
                                                disabled={loadingFull}
                                            />
                                        </Field>
                                        <Field label="Face read">
                                            <SelectFixed
                                                value={form.face_read}
                                                onChange={(v) => setForm((f) => ({ ...f, face_read: v }))}
                                                options={["", "LHR", "RHR"]}
                                                disabled={loadingFull}
                                            />
                                        </Field>

                                        <Field label="Board type">
                                            <SelectOrInput
                                                value={form.board_type}
                                                onChange={(v) => setForm((f) => ({ ...f, board_type: v }))}
                                                options={boardTypeOptions}
                                                disabled={loadingFull}
                                                placeholder="— Select —"
                                            />
                                        </Field>
                                    </div>
                                </section>

                                {/* Notes */}
                                <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                                    <label className="block text-xs text-zinc-600 mb-1">Notes</label>
                                    <textarea
                                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm min-h-[72px] focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                                        value={form.notes}
                                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                        disabled={loadingFull}
                                    />
                                </section>

                                {err && (
                                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                                        {err}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur flex items-center justify-between">
                        <div className="text-xs text-zinc-600">
                            {tab === "image" ? "Changes apply only to this board." : "Ensure sizes & location are correct before saving."}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={onClose}
                                className="px-3 py-1.5 rounded-full border border-zinc-300 hover:bg-zinc-100 text-sm disabled:opacity-50"
                                disabled={uploading || saving}
                            >
                                Cancel
                            </button>

                            {tab === "image" ? (
                                <button
                                    onClick={doUpload}
                                    className="px-3 py-1.5 rounded-full border border-blue-600 bg-blue-600 text-white text-sm shadow disabled:opacity-50"
                                    disabled={!readyToUpload || uploading}
                                >
                                    {uploading ? "Updating…" : "Update image"}
                                </button>
                            ) : (
                                <button
                                    onClick={doSave}
                                    className="px-3 py-1.5 rounded-full border border-blue-600 bg-blue-600 text-white text-sm shadow disabled:opacity-50"
                                    disabled={!readyToSave || saving || loadingFull}
                                >
                                    {saving ? "Saving…" : "Save changes"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

/* ---------- Small UI helpers ---------- */
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode; }) {
    return (
        <button
            onClick={onClick}
            className={
                "px-3 py-1.5 text-sm " +
                (active ? "bg-blue-600 text-white" : "bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900")
            }
        >
            {children}
        </button>
    );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <label className={"block text-xs mb-1 " + (required ? "font-semibold text-zinc-800 dark:text-zinc-200" : "text-zinc-600")}>
                {label} {required && <span className="text-red-600">*</span>}
            </label>
            {children}
        </div>
    );
}

function ReadRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1">
            <label className="block text-xs text-zinc-600 mb-1">{label}</label>
            <div className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200">
                {value}
            </div>
        </div>
    );
}

function Input({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; }) {
    return (
        <input
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 disabled:opacity-60"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
        />
    );
}

function NumberInput({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; }) {
    return (
        <input
            inputMode="numeric"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 disabled:opacity-60"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
        />
    );
}

// Renders a <select> when options exist; otherwise fallback to a text input
function SelectOrInput({
    value,
    onChange,
    options,
    placeholder,
    disabled,
}: {
    value: string;
    onChange: (v: string) => void;
    options: string[];
    placeholder?: string;
    disabled?: boolean;
}) {
    if (options && options.length) {
        return (
            <select
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 disabled:opacity-60"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
            >
                <option value="">{placeholder || "— Select —"}</option>
                {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        );
    }
    return <Input value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />;
}

// Strict select with a fixed options list (used for face direction/read)
function SelectFixed({
    value,
    onChange,
    options,
    disabled,
}: {
    value: string;
    onChange: (v: string) => void;
    options: string[];
    disabled?: boolean;
}) {
    return (
        <select
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 disabled:opacity-60"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
        >
            {options.map((opt) => (
                <option key={opt} value={opt}>{opt || "— Select —"}</option>
            ))}
        </select>
    );
}
