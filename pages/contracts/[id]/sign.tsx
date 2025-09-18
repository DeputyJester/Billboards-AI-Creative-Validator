// pages/contracts/[id]/sign.tsx
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function SignContractPage() {
    const router = useRouter();
    const { id } = router.query;

    const [iframeSrc, setIframeSrc] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/contracts/${id}/sign-info`);
                const text = await res.text();
                let json: any = {};
                try { json = text ? JSON.parse(text) : {}; } catch { throw new Error("Non-JSON response"); }
                if (!res.ok) throw new Error(json.error || "Failed to fetch sign info");

                const token: string | null =
                    json.token ||
                    (json.signingUrl ? String(json.signingUrl).split("/").pop() : null);

                if (!token) throw new Error("Signer token missing (prepare & send first).");

                // Build the embed URL
                const src = `https://sign.oohloop.com/sign/${token}?embed=true`;
                setIframeSrc(src);
                setError(null);
            } catch (e: any) {
                setError(e.message || String(e));
                setIframeSrc(null);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    return (
        <div className="p-6 space-y-4">
            <h1 className="text-xl font-semibold">Sign Contract</h1>

            {loading && <div className="text-sm text-gray-500">Loading signer…</div>}

            {error && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    <div className="font-medium mb-1">Unable to load signer</div>
                    <div>{error}</div>
                    <div className="mt-2 text-xs text-red-600/80">
                        Tip: Make sure the contract was <b>prepared</b> and <b>sent</b>. You can re-click
                        “Prepare” (which now auto-sends) and then refresh this page.
                    </div>
                </div>
            )}

            {iframeSrc && (
                <div className="rounded-xl overflow-hidden border">
                    <iframe
                        src={iframeSrc}
                        title="Signer"
                        width="100%"
                        height="900"
                        style={{ border: "0" }}
                        allow="clipboard-write; fullscreen"
                    />
                </div>
            )}
        </div>
    );
}
