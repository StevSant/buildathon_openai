import type { ReactNode } from "react";
import { AuthGuard, NotificationHost, TabBar } from "@/components";

// The shared authenticated shell keeps protected routes, realtime alerts, and persistent
// navigation together while the individual feature routes remain independent.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="app-shell app-shell--app">
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
        <NotificationHost />
        <TabBar />
      </div>
    </AuthGuard>
  );
}
