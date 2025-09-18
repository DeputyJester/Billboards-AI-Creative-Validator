import { useState } from "react";

export default function DevContractApiTest() {
    const [contractId, setContractId] = useState("");
    const [out, setOut] = useState<string>("");

    async function post(path: string) {
        setOut("Working…");
        try {
            const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" } });
            const text = await res.text();
            let json: any = {};
            try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
            if (!res.ok) throw new Error(json?.error || res.statusText);
            setOut(JSON.stringify(json, null, 2));
        } catch (e: any) {
            setOut("ERROR: " + (e?.message || String(e)));
        }
    }

    const cleaned = contractId.trim(); // 👈 trims pasted IDs

    return (
        <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Contract API Test</h1>

            <label style={{ display: "block", marginBottom: 8 }}>
                Contract ID:
                <input
                    value={contractId}
                    onChange={(e) => setContractId(e.target.value.trim())}
                    placeholder="paste a contracts.id value (UUID)"
                    style={{ width: "100%", padding: 8, marginTop: 4, border: "1px solid #ddd", borderRadius: 8 }}
                />
            </label>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button
                    onClick={() => post(`/api/contracts/${cleaned}/prepare`)}
                    disabled={!cleaned}
                    style={{ padding: "8px 12px", borderRadius: 8, background: "#4f46e5", color: "#fff", border: "none" }}
                >
                    Prepare
                </button>
                <button
                    onClick={() => post(`/api/contracts/${cleaned}/send`)}
                    disabled={!cleaned}
                    style={{ padding: "8px 12px", borderRadius: 8, background: "#111827", color: "#fff", border: "none" }}
                >
                    Send
                </button>
            </div>

            <pre
                style={{
                    background: "#f9fafb",
                    border: "1px solid #eee",
                    borderRadius: 8,
                    padding: 12,
                    minHeight: 140,
                    whiteSpace: "pre-wrap",
                }}
            >
                {out || "Output will show here"}
            </pre>
        </div>
    );
}
