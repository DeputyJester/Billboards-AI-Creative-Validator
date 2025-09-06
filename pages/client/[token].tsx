// pages/client/[token].tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type ResolvedGroup = {
    id: string;            // creative_group_id
    label: string;         // e.g., "1080×1920 px"
    width_px: number | null;
    height_px: number | null;
};

type ResolveOK = {
    ok: true;
    campaignId: string;
    campaignName: string;
    organizationId: string;
    organizationName: string;
    inviteEmail: string;
    expiresAtISO?: string; // ISO string (optional)
    groups: ResolvedGroup[];
};
type ResolveERR = { ok: false; message?: string; error?: string };
type ResolveResp = ResolveOK | ResolveERR;

type UploadUrlOK = {
    ok: true;
    uploadUrl: string;
    path: string;       // storage path
    creativeId: string; // DB id
};
type UploadUrlERR = { ok: false; message?: string; error?: string };
type UploadUrlResp = UploadUrlOK | UploadUrlERR;

type CompleteOK = { ok: true };
type CompleteERR = { ok: false; message?: string; error?: string };
type CompleteResp = CompleteOK | CompleteERR;

type SubmitOK = { ok: true };
type SubmitERR = { ok: false; message?: string; error?: string };
type SubmitResp = SubmitOK | SubmitERR;

type Status = "idle" | "validating" | "error" | "ready" | "uploading" | "uploaded" | "submitted";
type MessageCard = { title: string; lines?: string[] } | null;

/* Validator result (narrowed union) */
type ValidateOk = { ok: true; gotW: number; gotH: number };
type ValidateBad = { ok: false; gotW?: number; gotH?: number; why?: "SIZE" | "BAD" };
type ValidateResult = ValidateOk | ValidateBad;

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function ClientUploadPage() {
    const [token, setToken] = useState<string>("");
    const [res, setRes] = useState<ResolveOK | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string>("");

    // per-spec state
    const [files, setFiles] = useState<(File | null)[]>([]);
    const [previews, setPreviews] = useState<(string | null)[]>([]);
    const [status, setStatus] = useState<Status[]>([]);
    const [messages, setMessages] = useState<(MessageCard)[]>([]);
    const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

    // track creative IDs returned by /api/client-upload-url (used for final submit)
    const [creativeIds, setCreativeIds] = useState<(string | null)[]>([]);

    // final submit UX
    const [submitEmail, setSubmitEmail] = useState<string>("");
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string>("");
    const [submitDone, setSubmitDone] = useState(false);

    // Grab token from URL
    useEffect(() => {
        const t = window.location.pathname.split("/client/")[1] || "";
        setToken(t);
    }, []);

    // Prevent whole-page drop from opening the file in a new tab
    useEffect(() => {
        const prevent = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };
        window.addEventListener("dragover", prevent);
        window.addEventListener("drop", prevent);
        return () => {
            window.removeEventListener("dragover", prevent);
            window.removeEventListener("drop", prevent);
        };
    }, []);

    // Resolve token -> campaign + groups
    useEffect(() => {
        if (!token) return;
        (async () => {
            try {
                setLoading(true);
                setErr("");
                const r = await fetch(`/api/client-resolve-token?token=${encodeURIComponent(token)}`);
                const j: ResolveResp = await r.json();
                if (!j.ok) {
                    const msg = ("message" in j && j.message) || ("error" in j && j.error) || "Invalid or expired link.";
                    throw new Error(msg);
                }
                setRes(j);

                const n = j.groups.length;
                setFiles(Array(n).fill(null));
                setPreviews(Array(n).fill(null));
                setStatus(Array(n).fill("idle"));
                setMessages(Array(n).fill(null));
                setCreativeIds(Array(n).fill(null));
                setSubmitDone(false);
                setSubmitError("");
            } catch (e: any) {
                setErr(e?.message || "Could not load campaign.");
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    // Cleanup preview blob URLs on unmount
    useEffect(() => {
        return () => {
            previews.forEach((u) => u && URL.revokeObjectURL(u));
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const validatedCount = useMemo(
        () => status.filter((s) => s === "ready" || s === "uploaded" || s === "submitted").length,
        [status]
    );
    const uploadedCount = useMemo(
        () => status.filter((s) => s === "uploaded" || s === "submitted").length,
        [status]
    );

    const total = res?.groups.length ?? 0;
    const allUploaded = useMemo(
        () => creativeIds.filter(Boolean).length === total && total > 0,
        [creativeIds, total]
    );

    const choose = (idx: number) => {
        const input = inputsRef.current[idx];
        if (input) input.click();
    };

    const onFilePicked = (idx: number, fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return;
        handleUpload(idx, fileList[0]);
    };

    const clearAt = (idx: number) => {
        setFiles((f) => { const c = [...f]; c[idx] = null; return c; });
        setStatus((s) => { const c = [...s]; c[idx] = "idle"; return c; });
        setMessages((m) => { const c = [...m]; c[idx] = null; return c; });
        setCreativeIds((ids) => { const c = [...ids]; c[idx] = null; return c; });
        setPreviews((p) => {
            const c = [...p];
            if (c[idx]) URL.revokeObjectURL(c[idx]!);
            c[idx] = null;
            return c;
        });
        const input = inputsRef.current[idx];
        if (input) input.value = ""; // allow re-picking the same file name
    };

    const handleUpload = async (idx: number, file: File) => {
        if (!res) return;

        const g = res.groups[idx];
        const wantW = g.width_px ?? null;
        const wantH = g.height_px ?? null;

        // reset message; begin validation
        setMessages((m) => { const c = [...m]; c[idx] = null; return c; });
        setStatus((s) => { const c = [...s]; c[idx] = "validating"; return c; });

        // 1) Validate client-side
        const check = await validateImage(file, wantW, wantH);
        if (!check.ok) {
            if ("why" in check && check.why === "SIZE") {
                setMessages((m) => {
                    const c = [...m];
                    c[idx] = {
                        title: "Incorrect Size",
                        lines: [
                            `Image received: ${check.gotW ?? "?"} × ${check.gotH ?? "?"}px`,
                            `Image requirements: ${wantW ?? "—"} × ${wantH ?? "—"}px`,
                        ],
                    };
                    return c;
                });
            } else {
                setMessages((m) => {
                    const c = [...m];
                    c[idx] = { title: "Invalid image", lines: ["Could not read this file."] };
                    return c;
                });
            }
            setStatus((s) => { const c = [...s]; c[idx] = "error"; return c; });
            return;
        }

        // 2) Accept & preview (valid)
        setFiles((f) => { const c = [...f]; c[idx] = file; return c; });
        setPreviews((p) => {
            const next = [...p];
            if (next[idx]) URL.revokeObjectURL(next[idx]!);
            next[idx] = URL.createObjectURL(file);
            return next;
        });
        setStatus((s) => { const c = [...s]; c[idx] = "ready"; return c; });

        // 3) Ask server for signed upload URL
        setStatus((s) => { const c = [...s]; c[idx] = "uploading"; return c; });
        try {
            const q = new URLSearchParams({
                token,
                groupId: g.id,
                name: file.name || `upload_${Date.now()}.png`,
                contentType: file.type || "image/png",
            });
            const u = await fetch(`/api/client-upload-url?${q.toString()}`, { method: "GET" });
            const uj: UploadUrlResp = await u.json();
            if (!uj.ok) {
                const msg = ("message" in uj && uj.message) || ("error" in uj && uj.error) || "Could not start upload.";
                throw new Error(msg);
            }

            // 4) PUT to storage
            const put = await fetch(uj.uploadUrl, { method: "PUT", body: file });
            if (!put.ok) throw new Error(`Upload failed (${put.status})`);

            // 5) notify complete
            const doneQ = new URLSearchParams({
                token,
                creativeId: uj.creativeId,
                path: uj.path,
                contentType: file.type || "image/png",
                size: String(file.size),
                name: file.name || "upload",
            });
            const done = await fetch(`/api/client-upload-complete?${doneQ.toString()}`, { method: "GET" });
            const dj: CompleteResp = await done.json();
            if (!dj.ok) {
                const msg = ("message" in dj && dj.message) || ("error" in dj && dj.error) || "Finalize failed.";
                throw new Error(msg);
            }

            // Keep the creativeId for final submit
            setCreativeIds((ids) => { const c = [...ids]; c[idx] = uj.creativeId; return c; });

            setMessages((m) => { const c = [...m]; c[idx] = null; return c; });
            setStatus((s) => { const c = [...s]; c[idx] = "uploaded"; return c; });
        } catch (e: any) {
            setMessages((m) => {
                const c = [...m];
                c[idx] = { title: "Upload failed", lines: [e?.message || "Please try again."] };
                return c;
            });
            setStatus((s) => { const c = [...s]; c[idx] = "error"; return c; });
        }
    };

    const handleSubmit = async () => {
        if (!res) return;
        setSubmitError("");
        setSubmitting(true);
        try {
            const ids = creativeIds.filter((x): x is string => !!x);
            if (ids.length !== (res.groups.length || 0)) {
                throw new Error("Please upload all required creatives before submitting.");
            }
            const r = await fetch("/api/client-submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token,
                    creativeIds: ids,
                    email: submitEmail?.trim() || undefined,
                }),
            });
            const j: SubmitResp = await r.json();
            if (!j.ok) {
                const msg = ("message" in j && j.message) || ("error" in j && j.error) || "Submit failed.";
                throw new Error(msg);
            }
            // Mark UI as submitted
            setStatus((s) => s.map(() => "submitted"));
            setSubmitDone(true);
        } catch (e: any) {
            setSubmitError(e?.message || "Submit failed.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <Shell><div className="p-6 text-sm text-zinc-600">Loading…</div></Shell>;
    if (err) return <Shell><div className="p-6 text-sm text-red-600">{err}</div></Shell>;
    if (!res) return <Shell><div className="p-6 text-sm text-zinc-600">Link not found.</div></Shell>;

    return (
        <Shell>
            <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
                {/* Header row: org + campaign */}
                <div className="space-y-1">
                    <div className="text-sm text-zinc-600">
                        <span className="font-medium">{res.organizationName}</span>
                        <span className="mx-1">·</span>
                        <span className="text-zinc-500">{res.campaignName}</span>
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight">Upload creatives for your campaign</h1>
                    <div className="text-xs text-zinc-500">
                        Invited: {res.inviteEmail || "—"}
                        {res.expiresAtISO && <>. Link expires {fmtRelative(res.expiresAtISO)}.</>}
                    </div>
                </div>

                {/* Top summary pill */}
                <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-sm">
                        {res.groups.length} {res.groups.length === 1 ? "creative needed" : "creatives needed"}
                    </div>
                    <div className="text-xs text-zinc-500">Validated {validatedCount} of {res.groups.length}</div>
                </div>

                {/* Grid of spec tiles (Edge-friendly visuals) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {res.groups.map((g, idx) => {
                        const wantW = g.width_px ?? null;
                        const wantH = g.height_px ?? null;
                        const st = status[idx] ?? "idle";
                        const msg = messages[idx];
                        const previewUrl = previews[idx];

                        return (
                            <section
                                key={g.id}
                                className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3 shadow-sm"
                                style={{ boxShadow: "inset 0 0 0 0 rgba(0,0,0,0)" }}
                            >
                                {/* Title row */}
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-medium">{g.label}</div>
                                    <StatusDot status={st} />
                                </div>
                                <div className="text-xs text-zinc-500">
                                    Required: {wantW ?? "—"} × {wantH ?? "—"}px · PNG/JPG ≤ 5 MB
                                </div>

                                {/* Dropzone / Preview */}
                                <div
                                    className="rounded-xl bg-white h-36 flex items-center justify-center text-sm text-zinc-700 cursor-pointer border-2 border-dashed border-zinc-300"
                                    style={{ boxShadow: "inset 0 0 0 1px rgba(24,24,27,.08)" }}
                                    onClick={() => choose(idx)}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.dataTransfer.dropEffect = "copy";
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onFilePicked(idx, e.dataTransfer.files);
                                    }}
                                >
                                    {previewUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={previewUrl} alt="preview" className="max-h-32 object-contain" />
                                    ) : (
                                        <span>Drag and drop or click to upload</span>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    <input
                                        ref={(el) => { inputsRef.current[idx] = el; }}
                                        type="file"
                                        accept="image/png,image/jpeg"
                                        className="hidden"
                                        onChange={(e) => onFilePicked(idx, e.target.files)}
                                    />
                                    <button
                                        className="px-3 py-1.5 rounded-full border border-zinc-300 hover:bg-zinc-100 text-sm"
                                        onClick={() => choose(idx)}
                                    >
                                        Choose file
                                    </button>
                                    {st !== "idle" && (
                                        <button
                                            className="px-3 py-1.5 rounded-full border border-zinc-300 hover:bg-zinc-100 text-sm"
                                            onClick={() => clearAt(idx)}
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>

                                {/* Message / errors */}
                                {msg && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                        <div className="text-sm font-medium text-amber-800">{msg.title}</div>
                                        {msg.lines && msg.lines.length > 0 && (
                                            <ul className="mt-1 text-xs text-amber-800 space-y-0.5">
                                                {msg.lines.map((ln, i) => <li key={i}>{ln}</li>)}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>

                {/* Footer reassurance */}
                <div className="text-xs text-zinc-500">
                    You can upload now without an account. If you create an account later, your previous uploads will be linked automatically to your profile.
                </div>
            </div>

            {/* Sticky Submit Bar */}
            <div className="fixed inset-x-0 bottom-0 z-50">
                <div className="max-w-5xl mx-auto px-4 pb-4">
                    <div className="rounded-2xl border border-zinc-200 bg-white/95 shadow-xl backdrop-blur p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="text-sm">
                            <span className="font-medium">{uploadedCount} of {res.groups.length}</span> uploaded
                            {submitDone && <span className="ml-2 text-emerald-700">• Submitted!</span>}
                        </div>

                        <div className="flex flex-col md:flex-row md:items-center gap-2">
                            <input
                                type="email"
                                placeholder="Optional: your email to link uploads"
                                className="w-full md:w-80 rounded-full border border-zinc-300 px-3 py-1.5 text-sm"
                                value={submitEmail}
                                onChange={(e) => setSubmitEmail(e.target.value)}
                            />
                            <button
                                onClick={handleSubmit}
                                disabled={!allUploaded || submitting || submitDone}
                                className={
                                    "px-4 py-1.5 rounded-full border text-sm shadow " +
                                    (allUploaded && !submitting && !submitDone
                                        ? "border-blue-600 bg-blue-600 text-white"
                                        : "border-zinc-300 text-zinc-400 cursor-not-allowed")
                                }
                            >
                                {submitting ? "Submitting…" : submitDone ? "Submitted" : "Submit"}
                            </button>
                        </div>

                        {submitError && (
                            <div className="text-xs text-rose-600">{submitError}</div>
                        )}
                    </div>
                </div>
            </div>
        </Shell>
    );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status: Status }) {
    const base = "inline-flex items-center justify-center w-5 h-5 rounded-full";
    switch (status) {
        case "submitted":
            return <span className={`${base} bg-emerald-700 text-white`} title="Submitted">✓</span>;
        case "uploaded":
            return <span className={`${base} bg-emerald-600 text-white`} title="Uploaded">✓</span>;
        case "ready":
            return <span className={`${base} bg-blue-600 text-white`} title="Validated">✓</span>;
        case "uploading":
            return <span className={`${base} bg-blue-100 text-blue-700 animate-pulse`} title="Uploading">…</span>;
        case "error":
            return <span className={`${base} bg-rose-600 text-white`} title="Needs attention">×</span>;
        case "validating":
            return <span className={`${base} bg-zinc-100 text-zinc-600 animate-pulse`} title="Validating">·</span>;
        default:
            return <span className={`${base} bg-zinc-200 text-zinc-500`} title="Not started">•</span>;
    }
}

function fmtRelative(iso: string) {
    const when = new Date(iso).getTime();
    const now = Date.now();
    const diff = when - now;
    const days = Math.round(diff / (1000 * 60 * 60 * 24));
    if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
    return "today";
}

async function validateImage(file: File, wantW: number | null, wantH: number | null): Promise<ValidateResult> {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return { ok: false, why: "BAD" };
    const gotW = bmp.width, gotH = bmp.height;
    if (wantW && wantH && (gotW !== wantW || gotH !== wantH)) {
        return { ok: false, gotW, gotH, why: "SIZE" };
    }
    return { ok: true, gotW, gotH };
}

/* ------------------------------------------------------------------ */
/* Minimal shell (header-less)                                        */
/* ------------------------------------------------------------------ */

function Shell({ children }: { children: React.ReactNode }) {
    return <div className="min-h-screen bg-white pb-24">{children}</div>; // bottom padding for sticky bar
}

/** Tell _app.js to hide the global header on this route */
(ClientUploadPage as any).noHeader = true;
export default ClientUploadPage;
