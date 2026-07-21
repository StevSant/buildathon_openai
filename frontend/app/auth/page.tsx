import { AuthForm } from "@/components";

// Pre-login screen — no tab bar.
export default function AuthPage() {
  return (
    <div className="app-shell">
      <header className="px-5 pt-8">
        <div className="text-[30px] font-extrabold tracking-tight">
          Pul<em className="not-italic text-accent">so</em>
        </div>
        <p className="mt-1 text-[13px] text-muted">
          La ciudad en tiempo real, verificada. Reporta con una foto, todos lo ven en el
          mapa al instante.
        </p>
      </header>
      <AuthForm />
    </div>
  );
}
