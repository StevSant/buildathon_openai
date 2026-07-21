import Link from "next/link";
import {
  AlertRulesForm,
  EmergencyContactsForm,
  Icon,
  PermissionsCard,
  SosButton,
  WhatsAppConfigForm,
} from "@/components";

// Security settings combine device onboarding, WhatsApp opt-in, trusted contacts, alert rules,
// and the manual SOS surface in the profile-only route.
export default function SecurityPage() {
  return (
    <div className="s-safe">
      <div className="det-head" style={{ padding: "10px 2px 8px" }}>
        <Link href="/profile" aria-label="Volver a Perfil" className="iconbtn">
          <Icon name="ic-back" />
        </Link>
        <span className="shd">Seguridad y WhatsApp</span>
      </div>

      <PermissionsCard />
      <WhatsAppConfigForm />
      <EmergencyContactsForm />
      <AlertRulesForm />
      <SosButton />

      <p className="hint" style={{ padding: "2px 2px 8px" }}>
        Conecta tu WhatsApp, agrega contactos con su autorización y define un umbral más
        ajustado. El SOS envía tu ubicación al instante.
      </p>
    </div>
  );
}
