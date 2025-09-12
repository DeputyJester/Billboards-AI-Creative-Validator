// pages/client/claim.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import supabase from "@/lib/supabaseclient";

// Force SSR so Next/Vercel does NOT try to statically pre-render this page at build time.
export async function getServerSideProps() {
    return { props: {} };
}

export default function ClientClaimPage() {
    const router = useRouter();
    const [status, setStatus] = useState<"idle" | "working" | "ok" | "err">("idle");
    const [message, setMessage] = useState<string>("");

    useEffect(() => {
        // wait until query is hydrated on the client
        const token =
            (router.query.token as string) ||
            (router.query.inviteToken as string) ||
            "";

        if (!token) {
            setStatus("err");
            setMessage("Missing invite token in the URL.");
            return;
        }

        (async () => {
            setStatus("working");
            setMessage("Linking your account to the invite…");

            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                setStatus("err");
                setMessage("You must be logged in to claim this invite.");
                return;
            }

            try {
                const res = await fetch("/api/client/claim", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ inviteToken: token }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(json?.error || "Claim failed.");
                }

                setStatus("ok");
                setMessage("Success! Redirecting…");
                // go wherever you want clients to land
                router.replace("/dashboard");
            } catch (e: any) {
                setStatus("err");
                setMessage(e?.message || "Claim failed.");
            }
        })();
    }, [router.query]);

    return (
        <div className="max-w-lg mx-auto p-6">
            <h1 className="text-lg font-semibold mb-2">Claim Invite</h1>
            <p className="text-sm text-neutral-700">
                {status === "idle" && "Preparing…"}
                {status === "working" && message}
                {status === "ok" && message}
                {status === "err" && message}
            </p>
        </div>
    );
}
