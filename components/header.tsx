// components/header.tsx
'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import supabase from "@/lib/supabaseclient";

export default function Header() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Read session on mount + keep in sync
  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setEmail(session?.user?.email ?? null);
      setLoading(false);

      const { data } = supabase.auth.onAuthStateChange((_event, sess) => {
        setEmail(sess?.user?.email ?? null);
      });
      unsub = () => data.subscription.unsubscribe();
    })();

    return () => { unsub?.(); };
  }, []);

  async function onSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="w-full border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Brand logo (left) */}
          <Link href="/" aria-label="OOHLoop home" className="mr-1 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/Loop-Logo-Dark.svg"
              alt="OOHLoop"
              className="h-16 w-auto md:h-20"
            />
          </Link>

          {/* Primary nav */}
          <nav className="hidden md:flex items-center gap-4 text-sm text-neutral-700">
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <Link href="/upload-specs" className="hover:underline">Upload specs</Link>
            <Link href="/inventory" className="hover:underline">Inventory</Link>
          </nav>
        </div>

        <div className="text-sm">
          {loading ? (
            <span className="text-neutral-500">…</span>
          ) : email ? (
            <div className="flex items-center gap-3">
              <span className="text-neutral-700">
                Signed in as <strong>{email}</strong>
              </span>
              <button
                onClick={onSignOut}
                className="rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-100"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-100"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
