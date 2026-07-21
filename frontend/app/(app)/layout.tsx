"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TabBar } from "@/components";
import { getSession, onAuthChange } from "@/lib";

// Post-login shell: guards the route group and mounts the persistent bottom tab bar.
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;

    async function guard() {
      const session = await getSession();
      if (!active) return;
      if (!session) {
        router.replace("/auth");
        return;
      }
      setChecked(true);
    }
    void guard();

    const unsubscribe = onAuthChange((session) => {
      if (!session) router.replace("/auth");
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  if (!checked) {
    return (
      <div className="app-shell items-center justify-center">
        <span className="text-[13px] text-muted">Cargando...</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      <TabBar />
    </div>
  );
}
