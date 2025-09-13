// pages/settings.tsx
import AppShell from "@/components/layout/appshell";

export default function SettingsPage() {
    return (
        <AppShell>
            <div className="space-y-8">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-semibold">Settings</h1>
                    <span className="text-xs text-neutral-500">Placeholder page</span>
                </div>

                {/* Organization */}
                <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-medium">Organization</h2>
                    <p className="mt-1 text-sm text-neutral-600">
                        Company name, branding, and default preferences.
                    </p>
                    <div className="mt-4 flex gap-2">
                        <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
                            Edit organization
                        </button>
                        <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
                            Manage members
                        </button>
                    </div>
                </section>

                {/* Profile */}
                <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-medium">Profile</h2>
                    <p className="mt-1 text-sm text-neutral-600">
                        Update your name, email, and password.
                    </p>
                    <div className="mt-4 flex gap-2">
                        <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
                            Edit profile
                        </button>
                        <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
                            Change password
                        </button>
                    </div>
                </section>

                {/* Billing (coming soon) */}
                <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-medium">Billing</h2>
                    <p className="mt-1 text-sm text-neutral-600">
                        Subscription and invoices (coming soon).
                    </p>
                    <button
                        className="mt-4 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-400"
                        disabled
                    >
                        Coming soon
                    </button>
                </section>
            </div>
        </AppShell>
    );
}
