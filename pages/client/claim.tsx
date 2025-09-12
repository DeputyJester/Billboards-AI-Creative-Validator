// pages/client/claim.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import supabase from "@/lib/supabaseclient";

export default function ClientClaimPage() {
    const router = useRouter();
    const [msg, setMsg] = useState("Waiting for token…");
    const [working, setWorking] = useState(false);

    useEffect(() => {
        (async () => {
            const token =
                (router.query.token as string) ||
                (typeof window !== "undefined"
                    ? new URLSearchParams(window.location.search).get("token") || ""
                    : "");

            if (!token) return;

            setWorking(true);
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.access_token) {
                    setMsg("Please log in first, then revisit this link.");
                    setWorking(false);
                    return;
                }

                const resp = await fetch("/api/client/claim", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ inviteToken: token }),
                });

                const json = await resp.json();
                if (!resp.ok) throw new Error(json?.error || "Failed to claim invite");

                setMsg("Invite claimed. Redirecting…");
                router.replace("/campaigns");
            } catch (e: any) {
                setMsg(e?.message || "Something went wrong.");
            } finally {
                setWorking(false);
            }
        })();
    }, [router.query.token, router]);

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="max-w-md w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm p-5">
                <h1 className="text-lg font-semibold">Claim Invite</h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">{msg}</p>
                {working && <div className="mt-3 text-xs text-zinc-500">Working…</div>}
            </div>
        </div>
    );
}

// Force SSR so Next won’t pre-render at build time
export async function getServerSideProps() {
    return { props: {} };
}
