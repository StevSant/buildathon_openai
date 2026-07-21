import { AuthForm } from "@/components";

// Pre-login screen — no tab bar. The animated brand mark and the whole auth block live
// inside AuthForm's .s-auth container, so the layout mirrors the approved mockup 1:1.
export default function AuthPage() {
  return (
    <main className="app-shell">
      <AuthForm />
    </main>
  );
}
