import Link from "next/link";
import { EmergencyContactsForm, AlertRulesForm, SosButton } from "@/components";

// "Seguridad y WhatsApp" — connect WhatsApp (via Hermes), manage emergency contacts with
// opt-in, tune the tighter contact-alert threshold, and the manual SOS button.
export default function SecurityPage() {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3.5">
      <div className="flex items-center gap-2 px-0.5">
        <Link href="/profile" aria-label="Volver" className="text-muted">
          ←
        </Link>
        <h1 className="text-[18px] font-extrabold">Seguridad y WhatsApp</h1>
      </div>

      {/* WhatsApp integration summary */}
      <div className="rounded-[14px] border border-line bg-panel">
        <div className="px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-faint">
          Integración WhatsApp · Hermes
        </div>
        <div className="flex items-center gap-3 border-t border-line px-3.5 py-3">
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,#25D366_20%,var(--panel))] text-[#25D366]">
            💬
          </span>
          <div className="flex-1">
            <div className="text-[13px] font-semibold">Tu número</div>
            <div className="font-mono text-[11px] text-muted">Conectar WhatsApp</div>
          </div>
          <span className="rounded-md bg-[color-mix(in_srgb,var(--sev-road)_14%,transparent)] px-1.5 py-1 text-[10px] font-semibold uppercase text-sev-road">
            Pendiente
          </span>
        </div>
      </div>

      <EmergencyContactsForm />
      <AlertRulesForm />
      <SosButton />

      <p className="px-1 pb-2 text-[10.5px] text-faint">
        Conectas tu WhatsApp, agregas contactos (con opt-in), y defines un umbral más
        ajustado. El SOS envía tu ubicación al instante. Envío vía puerto MessagingGateway →
        adaptador Hermes.
      </p>
    </div>
  );
}
