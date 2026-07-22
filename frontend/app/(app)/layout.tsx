import type { ReactNode } from "react";
import { AuthGuard, LocationProvider, NotificationHost, TabBar } from "@/components";

// The shared authenticated shell keeps protected routes, realtime alerts, and persistent
// navigation together while the individual feature routes remain independent. LocationProvider
// owns the single current-location lifecycle every surface inside the shell reads from.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <LocationProvider>
        <div className="app-shell">
          <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
          <NotificationHost />
          <TabBar />
        </div>
      </LocationProvider>
    </AuthGuard>
  );
}
