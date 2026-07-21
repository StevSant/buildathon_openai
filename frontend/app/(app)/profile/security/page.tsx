import Link from "next/link";
import {
  AlertRulesForm,
  EmergencyContactsForm,
  PermissionsCard,
  SosButton,
  WhatsAppConfigForm,
} from "@/components";

// Security settings combine device onboarding, WhatsApp opt-in, trusted contacts, alert rules,
// and the manual SOS surface in the profile-only route.
export default function SecurityPage() {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3.5">
      <header className="flex items-center gap-2 px-0.5">
        <Link
          href="/profile"
          aria-label="Volver a Perfil"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-panel-2 text-muted"
        >
          ←
        </Link>
        <h1 className="text-[18px] font-extrabold">Seguridad y WhatsApp</h1>
      </header>

      <PermissionsCard />
      <WhatsAppConfigForm />
      <EmergencyContactsForm />
      <AlertRulesForm />
      <SosButton />

      <p className="px-1 pb-2 text-[10.5px] leading-4 text-faint">
        Conecta tu WhatsApp, agrega contactos con su autorización y define un umbral más
        ajustado. El SOS envía tu ubicación al instante.
      </p>
    </div>
  );
}
