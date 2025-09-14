// components/layout/appshell.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabaseclient";

import {
    Menu,
    LayoutDashboard,
    UploadCloud,
    Boxes,
    Megaphone,
    Settings as SettingsIcon,
    LogOut,
} from "lucide-react";

type NavItem = {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    match?: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Upload specs", href: "/upload-specs", icon: UploadCloud },
    { label: "Inventory", href: "/inventory", icon: Boxes },
    { label: "Campaigns", href: "/campaigns", icon: Megaphone },
    { label: "Settings", href: "/settings", icon: SettingsIcon },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
    const router = useRouter();

    // collapsed state (persisted)
    const [collapsed, setCollapsed] = useState<boolean>(false);
    useEffect(() => {
        const saved = localStorage.getItem("navCollapsed");
        if (saved === "1") setCollapsed(true);
    }, []);
    useEffect(() => {
        localStorage.setItem("navCollapsed", collapsed ? "1" : "0");
    }, [collapsed]);

    // user/session
    const [email, setEmail] = useState<string | null>(null);
    const [loadingUser, setLoadingUser] = useState(true);

    useEffect(() => {
        let unsub: (() => void) | undefined;
        (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setEmail(session?.user?.email ?? null);
            setLoadingUser(false);
            const { data } = supabase.auth.onAuthStateChange((_event, sess) => {
                setEmail(sess?.user?.email ?? null);
            });
            unsub = () => data.subscription.unsubscribe();
        })();
        return () => unsub?.();
    }, []);

    async function handleSignOut() {
        await supabase.auth.signOut();
        router.replace("/login");
    }

    const pathname = router.pathname || "/";
    const logoTitle = useMemo(() => "OOH LOOP", []);

    return (
        <div className="flex min-h-screen bg-neutral-50">
            {/* Sidebar */}
            <aside
                className={`sticky top-0 z-40 h-screen border-r border-neutral-200 bg-white transition-[width] duration-200
        ${collapsed ? "w-16" : "w-64"} flex flex-col`}
            >
                {/* Top bar: hamburger + logo */}
                <div className="flex items-center gap-2 px-3 py-3">
                    <button
                        aria-label="Toggle navigation"
                        onClick={() => setCollapsed((v) => !v)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 hover:bg-neutral-100"
                    >
                        <Menu className="h-5 w-5" />
                    </button>

                    {!collapsed && (
                        <Link href="/" className="ml-1 flex items-center gap-3 min-w-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/brand/loop-logo-dark.svg"
                                alt="OOH LOOP"
                                className="h-20 w-auto"
                            />
                            <span className="sr-only">{logoTitle}</span>
                        </Link>
                    )}
                </div>

                {/* Nav (scrolls internally) */}
                <nav className="flex-1 overflow-y-auto px-2 pb-2">
                    <ul className="space-y-1">
                        {NAV_ITEMS.map((item) => {
                            const isActive =
                                item.match?.(pathname) ?? pathname.startsWith(item.href);
                            const Icon = item.icon;
                            return (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className={[
                                            "group flex items-center rounded-xl px-3 py-2 text-sm transition",
                                            isActive
                                                ? "bg-blue-50 text-blue-700"
                                                : "text-neutral-700 hover:bg-neutral-100",
                                        ].join(" ")}
                                    >
                                        <Icon
                                            className={[
                                                "mr-3 h-5 w-5 shrink-0",
                                                isActive ? "text-blue-700" : "text-neutral-500",
                                            ].join(" ")}
                                        />
                                        {!collapsed && <span className="truncate">{item.label}</span>}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* User block (pinned, spacious) */}
                <div className="border-t border-neutral-200 p-3">
                    {collapsed ? (
                        <div className="flex flex-col items-center gap-2">
                            <div
                                title={email ?? ""}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-700"
                            >
                                {(email ?? "U").slice(0, 1).toUpperCase()}
                            </div>
                            <button
                                onClick={handleSignOut}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 hover:bg-neutral-100"
                                title="Sign out"
                            >
                                <LogOut className="h-5 w-5 text-neutral-600" />
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-sm font-medium text-neutral-700">
                                    {(email ?? "U").slice(0, 1).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] text-neutral-500">
                                        {loadingUser ? "…" : "Signed in as"}
                                    </div>
                                    <div className="truncate text-sm font-medium text-neutral-800" title={email ?? ""}>
                                        {email ?? "Guest"}
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleSignOut}
                                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-100"
                            >
                                <LogOut className="h-4 w-4" />
                                <span>Sign out</span>
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1">
                <div className="mx-auto max-w-7xl p-6">{children}</div>
            </main>
        </div>
    );
}
