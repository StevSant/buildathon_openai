import type { ReactNode } from "react";
import { TabBar } from "@/components";

// Post-login shell: scrollable content above a persistent bottom tab bar.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      <TabBar />
    </div>
  );
}
