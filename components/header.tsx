// components/Header.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import supabase from "@/lib/supabaseclient";

interface UserInfo {
  email: string | null;
  role: string | null;
}

export default function Header() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo>({ email: null, role: null });

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email ?? null;
      const role =
        (data.user?.user_metadata as Record<string, any>)?.role ?? "user";
      setUser({ email, role });
    };

    loadUser();

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="w-full bg-white border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div
          className="text-lg font-semibold cursor-pointer"
          onClick={() => router.push("/")}
        >
          AdVisionAI
        </div>
        <div className="flex items-center gap-3">
          {user.role && (
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 border">
              {user.role === "admin" ? "Admin" : "User"}
            </span>
          )}
          <span className="text-sm text-gray-700">
            {user.email ? `Logged in as: ${user.email}` : "Not logged in"}
          </span>
          {user.email && (
            <button
              onClick={handleLogout}
              className="ml-2 px-3 py-1 rounded bg-gray-800 text-white hover:bg-black"
            >
              Log out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
