// pages/contracts/token.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

type ByTokenOk = {
    ok: true;
    contract_id: string;
    contract_number: string | null;
    documenso_document_id: number | null;
    signer: { role: "client" | "staff"; name: string | null; email: string | null };
    token: string | null;
    signingUrl: string | null;
    embedOrigin: string | null;
};

type ByTokenErr = { error: string };

export default function contract_public_page() {
    const router = useRouter();

    // Safely coerce router.query.token -> string
    const rawToken = router.query.token;
    const tok = typeof rawToken === "string" ? rawToken : Array.isArray(rawToken) ? rawToken[0] : "";

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [data, setData] = useState<ByTokenOk | null>(null);

    useEffect(() => {
        if (!tok) return;
        let cancelled = false;

        async function run() {
            setLoading(true);
            setErr(null);
            try {
                const res = await fetch(`/api/contracts/by-token?token=${encodeURIComponent(tok)}`);
                const json: ByTokenOk | ByTokenErr = await res.json();
                if (!res.ok || "error" in json) {
                    throw new Error((json as ByTokenErr).error || "token resolve failed");
                }
                if (!cancelled) setData(json as ByTokenOk);
            } catch (e: any) {
                if (!cancelled) setErr(e?.message || "invalid token");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        run();
        return () => {
            cancelled = true;
        };
    }, [tok]);

    function buildEmbedUrl(d: ByTokenOk): string | null {
        // Prefer the direct signingUrl from Documenso (returned by /prepare) if present.
        if (d.signingUrl) return d.signingUrl;

        // Fallback for your instance: /sign/:token
        if (d.embedOrigin && d.token) {
            const origin = d.embedOrigin.replace(/\/+$/, "");
            return `${origin}/sign/${encodeURIComponent(d.token)}`;
        }

        return null;
    }

    if (loading) {
        return (
            <main className="max-w-3xl mx-auto p-6">
                <div className="text-sm text-gray-500">Loading signer...</div>
            </main>
        );
    }

    if (err || !data) {
        return (
            <main className="max-w-3xl mx-auto p-6">
                <h1 className="text-xl font-semibold mb-2">Invalid or expired link</h1>
                <p className="text-sm text-gray-600">
                    {err || "We could not validate this signing link. Please ask your OOHLoop contact to resend it."}
                </p>
            </main>
        );
    }

    const iframeSrc = buildEmbedUrl(data);

    return (
        <main className="max-w-5xl mx-auto p-6">
            <header className="mb-4">
                <h1 className="text-2xl font-semibold">
                    {data.contract_number ? `Contract ${data.contract_number}` : "Contract"}
                </h1>
                <p className="text-sm text-gray-500">
                    Signer: {data.signer.name || data.signer.email || data.signer.role}
                </p>
            </header>

            {!iframeSrc ? (
                <div className="rounded-lg border p-4 bg-yellow-50 text-yellow-800">
                    We could not build a signing URL. This usually means either the document was not prepared yet
                    or the Documenso embed origin is not configured. If you just received this link, ask your rep
                    to click 'Send for signature' again and try once more.
                </div>
            ) : (
                <>
                    <div className="rounded-xl overflow-hidden border" style={{ height: 720 }}>
                        <iframe
                            title="Document signer"
                            src={iframeSrc}
                            className="w-full h-full"
                            allow="clipboard-read; clipboard-write; fullscreen"
                            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                        />
                    </div>

                    <div className="mt-3 text-xs text-gray-500">
                        Having trouble?{" "}
                        <a
                            href={iframeSrc}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 hover:underline"
                        >
                            open signing in a new tab
                        </a>
                        .
                    </div>
                </>
            )}
        </main>
    );
}
