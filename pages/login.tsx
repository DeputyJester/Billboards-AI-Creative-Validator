// pages/login.tsx
import { useState } from "react";
import { useRouter } from "next/router";
import supabase from "@/lib/supabaseclient";
import { choosePostLoginRoute } from "@/lib/routehelpers";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }
    const dest = await choosePostLoginRoute();
    router.replace(dest);
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      {/* Background video */}
      <video
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        src="/brand/login-page-background.mp4"
        autoPlay
        muted
        loop
        playsInline
      />
      {/* Soft overlay */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Content */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 py-12">
        {/* Logo — matches sign-in card width (max-w-md) */}
        <div className="mb-6 w-full max-w-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/Loop-Logo-Light.svg"
            alt="OOHLoop"
            className="w-full h-auto drop-shadow-[0_6px_18px_rgba(0,0,0,0.45)]"
          />
        </div>

        {/* Headline: plain “Billboards”, animated gradient “Reimagined” */}
        <h1 className="mb-2 text-center text-3xl font-extrabold tracking-tight md:text-4xl">
          <span className="plainTitle">Billboards</span>
          <span className="mx-2 opacity-80">,</span>
          <span className="gradText">Reimagined</span>!
        </h1>

        <p className="mb-10 text-center text-sm text-zinc-200 md:text-base">
          Ready To Transform Your Workflow?
        </p>

        {/* Sign-in card */}
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-md">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-200">Email</label>
              <input
                className="w-full rounded-lg border border-white/20 bg-white/90 px-3 py-2 text-zinc-900 placeholder-zinc-400 outline-none focus:border-sky-400 focus:bg-white"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-200">Password</label>
              <input
                className="w-full rounded-lg border border-white/20 bg-white/90 px-3 py-2 text-zinc-900 placeholder-zinc-400 outline-none focus:border-sky-400 focus:bg-white"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-md border border-red-300 bg-red-50/80 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60"
              type="submit"
              disabled={busy}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-zinc-300/80">
            Having trouble? Contact support@oohloop.com
          </p>
        </div>
      </div>

      {/* Page-scoped styles */}
      <style jsx global>{`
        /* Hide any global <header> on this page only */
        header { display: none !important; }

        /* Ping-pong gradient animation */
        @keyframes shine {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .gradText {
          background-image: linear-gradient(
            90deg,
            #ffffff,
            #dbeafe,
            #93c5fd,
            #3b82f6,
            #1d4ed8,
            #93c5fd,
            #dbeafe,
            #ffffff
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: shine 2.8s ease-in-out infinite alternate;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
        }
        .plainTitle {
          color: #ffffff;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
        }
      `}</style>
    </div>
  );
}
