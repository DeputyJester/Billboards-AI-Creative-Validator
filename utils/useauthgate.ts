// utils/useauthgate.ts
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import supabase from "@/lib/supabaseclient";

export type UseAuthGateReturn = {
  ready: boolean;
  userEmail: string | null;
};

export function useAuthGate(): UseAuthGateReturn {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      setUserEmail(session.user.email ?? null);
      setReady(true);

      const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
        if (!sess) router.replace("/login");
        else setUserEmail(sess.user.email ?? null);
      });
      unsub = () => sub.subscription.unsubscribe();
    })();

    return () => { unsub?.(); };
  }, [router]);

  return { ready, userEmail };
}
