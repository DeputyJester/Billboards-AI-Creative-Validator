import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * keep state in sync with the URL query string
 * - initial: default state object
 * - parammap: read params -> state (so you control names/types)
 */
export function usequerystate<T extends Record<string, any>>(
  initial: T,
  { parammap }: { parammap: (s: URLSearchParams) => T }
) {
  const router = useRouter();
  const [state, setstate] = useState<T>(initial);
  const first = useRef(true);

  // read from URL on first mount
  useEffect(() => {
    if (!router.isReady) return;
    const params = new URLSearchParams(window.location.search);
    const next = parammap(params);
    setstate((prev) => ({ ...prev, ...next }));
  }, [router.isReady]);

  // write to URL when state changes (only if different)
  const updateurl = useCallback(
    (next: T) => {
      const curr = new URLSearchParams(window.location.search);

      // Build "next" params from state
      const nextParams = new URLSearchParams();
      Object.entries(next).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          v.forEach((item) => item != null && nextParams.append(k, String(item)));
        } else if (v !== undefined && v !== null && v !== "") {
          nextParams.set(k, String(v));
        }
        // if undefined/null/empty -> omit from URL
      });

      // Only replace if changed
      if (curr.toString() !== nextParams.toString()) {
        router.replace(
          { pathname: router.pathname, query: Object.fromEntries(nextParams) },
          undefined,
          { shallow: true }
        );
      }
    },
    [router]
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => updateurl(state), 200);
    return () => clearTimeout(id);
  }, [state, updateurl]);

  return useMemo(() => ({ state, setstate }), [state]);
}
