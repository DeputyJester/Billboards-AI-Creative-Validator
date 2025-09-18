import * as React from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
// If you're already using sonner elsewhere (recommended):
import { toast } from "sonner";

type Props = {
    contractId: string;
    className?: string;
};

export default function SendForSignatureButton({ contractId, className }: Props) {
    const router = useRouter();
    const [busy, setBusy] = React.useState(false);

    async function run() {
        if (busy) return;
        setBusy(true);
        try {
            toast?.loading?.("Preparing document…", { id: "send-flow" });

            // 1) Prepare the Documenso document + recipients
            {
                const res = await fetch(`/api/contracts/${contractId}/prepare`, { method: "POST" });
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`Prepare failed: ${text || res.status}`);
                }
            }
            toast?.success?.("Prepared. Sending for signature…", { id: "send-flow" });

            // 2) Send (or mark ready) via Documenso
            {
                const res = await fetch(`/api/contracts/${contractId}/send`, { method: "POST" });
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`Send failed: ${text || res.status}`);
                }
            }
            toast?.success?.("Sent! Opening signer view…", { id: "send-flow" });

            // 3) Redirect to in-app signer
            router.push(`/contracts/${contractId}/sign`);
        } catch (err: any) {
            console.error(err);
            toast?.error?.(err?.message || "Failed to send for signature.", { id: "send-flow" });
            setBusy(false);
            return;
        }
    }

    return (
        <Button onClick={run} disabled={busy} className={className}>
            {busy ? "Sending…" : "Send for signature"}
        </Button>
    );
}
