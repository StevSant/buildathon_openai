import Image from "next/image";
import { AuthForm } from "@/components";

// Pre-login screen — no tab bar. The mark anchors the compact mobile auth layout.
export default function AuthPage() {
  return (
    <div className="app-shell">
      <header className="px-5 pt-[calc(2rem+env(safe-area-inset-top))]">
        <Image
          src="/icons/icon-192.png"
          alt="Pulso"
          width={48}
          height={48}
          className="h-12 w-12 rounded-[15px] shadow-[0_8px_20px_-10px_var(--accent)]"
        />
      </header>
      <AuthForm />
    </div>
  );
}
