// FILE: components/sidebar.tsx  (keep your actual path if different)

import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
    LayoutDashboard,
    PanelsTopLeft,
    Upload,
    Megaphone,
    Settings,
    ChevronLeft,
    ChevronRight,
    FileText, // ← icon for Contracts
} from "lucide-react";

export type NavItem = {
    label: string;
    href: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    exact?: boolean;
};

const DEFAULT_ITEMS: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true },
    { label: "Contracts", href: "/contracts", icon: FileText },          // ← new, second item
    { label: "Inventory", href: "/inventory", icon: PanelsTopLeft },
    { label: "Campaigns", href: "/campaigns", icon: Megaphone },
    { label: "Upload Specs", href: "/upload-specs", icon: Upload },      // ← capitalized “Specs”
    { label: "Settings", href: "/admin", icon: Settings },
];

export default function Sidebar({
    collapsed,
    onToggle,
    items = DEFAULT_ITEMS,
}: {
    collapsed: boolean;
    onToggle: () => void;
    items?: NavItem[];
}) {
    const router = useRouter();

    return (
        <aside className={"shrink-0 transition-all duration-200 " + (collapsed ? "w-16" : "w-60")}>
            <div className="sticky top-6">
                {/* Brand */}
                <div
                    className={
                        "mb-4 flex items-center rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm " +
                        (collapsed ? "justify-center" : "justify-between")
                    }
                >
                    <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/brand/loop-logo-dark.svg"
                            alt="OOH Loop"
                            className={collapsed ? "h-6 w-6" : "h-6 w-6"}
                            draggable={false}
                        />
                        {!collapsed && <span className="text-sm font-semibold tracking-wide">OOH Loop</span>}
                    </div>

                    {!collapsed ? (
                        <button
                            onClick={onToggle}
                            className="rounded-md border border-neutral-200 px-2 py-1 text-neutral-600 hover:bg-neutral-50"
                            aria-label="Collapse sidebar"
                            title="Collapse"
                        >
                            <ChevronLeft size={16} />
                        </button>
                    ) : (
                        <button
                            onClick={onToggle}
                            className="rounded-md border border-neutral-200 px-2 py-1 text-neutral-600 hover:bg-neutral-50"
                            aria-label="Expand sidebar"
                            title="Expand"
                        >
                            <ChevronRight size={16} />
                        </button>
                    )}
                </div>

                {/* Nav */}
                <nav className="space-y-1">
                    {items.map((it) => {
                        const isActive = it.exact ? router.pathname === it.href : router.pathname.startsWith(it.href);
                        const Icon = it.icon;
                        return (
                            <Link
                                key={it.href}
                                href={it.href}
                                title={it.label}
                                className={
                                    "group flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition " +
                                    (isActive
                                        ? "border-blue-600 bg-blue-50 text-blue-700"
                                        : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50")
                                }
                            >
                                <Icon size={18} className={isActive ? "text-blue-700" : "text-neutral-600"} />
                                {!collapsed && <span className="truncate">{it.label}</span>}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </aside>
    );
}
