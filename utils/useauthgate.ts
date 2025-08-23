// utils/useAuthGate.ts
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "./supabaseClient";

interface UseAuthGateOptions {
  requireRole?: "admin" | "user";
}

export function useAuthGate({ requireRole }: UseAuthGateOptions = {}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const role = (user.user_metadata as Record<string, any>)?.role ?? "user";

      if (requireRole && role !== requireRole) {
        router.replace("/dashboard");
        return;
      }

      setReady(true);
    };

    checkAuth();
  }, [router, requireRole]);

  return ready;
}
