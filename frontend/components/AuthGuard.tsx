"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authDestination, supabase } from "@/lib";

/** Prevent protected UI from rendering until Supabase confirms an active session. */
export default function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    function applySession(session: Parameters<typeof authDestination>[0]) {
      if (!active) return;
      const destination = authDestination(session);
      setAuthenticated(destination === null);
      setReady(true);
      if (destination) router.replace(destination);
    }

    void supabase.auth
      .getSession()
      .then(({ data, error }) => applySession(error ? null : data.session))
      .catch(() => applySession(null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (!ready || !authenticated) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted"
      >
        Verificando sesión…
      </div>
    );
  }

  return children;
}
