# Handoff — Pulso × Hermes (Carril "Integraciones & Delivery" / Persona C)

> **Para el agente que retoma:** Este documento es tu contexto completo. Sos el agente
> que ayuda a la **Persona C** del proyecto Pulso (Buildathon OpenAI, Manabí/Ecuador).
> No tenés memoria de la sesión anterior — todo lo que necesitás está acá.
> Repo: `/home/marcwos/Descargas/docs/buildathon_openai` (rama actual: `main`).

---

## 0. Reglas de trabajo (NO negociables)

- **Nunca trabajar sobre `main`.** Rama del carril: **`feat/c1-hermes`**.
- **Sin tests automáticos** (ADR-015): se verifica corriendo el demo.
- **Idioma:** copy de WhatsApp/UI en **español (Ecuador)**; código, comentarios, commits y docs en **inglés**. Commits **Conventional Commits**.
- **Imports por barrels** (`@pulso/core`, `@pulso/adapters`), nunca deep-file. Si falta un export en un barrel de backend, **avisar** (lo agrega Persona B), no editarlo.
- **Nada hardcodeado:** URLs/keys/umbrales por env (`CONTRACT.md §6`).
- **NO tocar (frozen / de otros carriles):** `backend/supabase/functions/agent-tools`, las RPCs, `backend/supabase/migrations/**`, `plans/CONTRACT.md`, y `docs/DECISIONS.md` / `docs/DATA-MODEL.md` **hasta que Persona B anuncie "B1+B6 frozen"**.
- Verificar el código **leyéndolo**, no de memoria, antes de escribir.

---

## 1. Qué es el proyecto

**Pulso** — PWA cívica (Next.js + Supabase/PostGIS + OpenAI) para incidentes urbanos
(accidentes, cierres, inundaciones, incendios). Diferenciador: **identidad verificada por
cédula** (solo se guarda hash HMAC). Agente de voz "Cerca" dentro de la app (OpenAI Realtime).

**Hermes** extiende Pulso a **WhatsApp**: la misma persona "Cerca" atiende por chat, y las
alertas de proximidad/SOS llegan por WhatsApp.

---

## 2. Mi carril (Persona C — Integraciones & Delivery)

**Plan que manda:** `plans/integrations/C1-hermes-chat-integration.md` (jubila a `B5`).
**Archivos que puedo editar (carve-out):**
```
backend/core/ports/messaging-gateway.ts
backend/core/use-cases/dispatch-proximity-alerts.ts
backend/adapters/messaging/**
backend/supabase/functions/proximity-dispatcher/**
bloque Hermes de backend/supabase/functions/_shared/env.ts + root .env.example
docs/hermes/**
root README.md
+ TODO lo off-repo (VM Hermes en Azure, Supabase cloud, Vercel)
```

**Arquitectura Hermes (correcta):** Hermes Agent (Nous Research) corre en una VM Azure. Dos flujos:
- **INBOUND** (conversacional): usuario → WhatsApp → Hermes → toolset `mcp-pulso` (shim Python **en la VM**) → llama al `agent-tools` existente → responde.
- **OUTBOUND** (alertas): insert de incidente / SOS → `proximity-dispatcher` (Edge Fn) → POST al webhook `pulso-alerts` de Hermes → WhatsApp.

---

## 3. ✅ LO QUE YA ESTÁ HECHO (VM / off-repo)

- **Azure VM:** `hermes-vm`, RG `pulso-hermes`, región `westus2`, size `Standard_D2s_v5`, **IP pública `20.230.224.245`**. SSH: `ssh azureuser@20.230.224.245` (key `~/.ssh/id_rsa`).
  - *Gotcha resuelto:* el provider `Microsoft.Compute` estaba `NotRegistered` (causaba `SkuNotAvailable` en todas las regiones). Se registró (`az provider register --namespace Microsoft.Compute`). La familia **B-series está racionada** para esta suscripción nueva → usar **D-series**.
- **Hermes v0.19.0** instalado, corriendo como **systemd user service** (`hermes gateway install` + `loginctl enable-linger`). Sobrevive reboot/logout.
- **LLM:** OpenAI (se reusó la `OPENAI_API_KEY` de Pulso), modelo **mini alcanzable** (p.ej. `gpt-4o-mini`).
  - *Gotcha:* NO usar `gpt-5.6-terra` (modelo del evento) — la key estándar no lo alcanza → error "Provider authentication failed". Usar el selector `hermes model` (solo lista modelos alcanzables).
- **WhatsApp:** vinculado por **Baileys/QR**, modo `self-chat`, número personal.
  - *Gotcha QR:* terminal oscura invierte el QR y WhatsApp no lo lee → usar fondo claro.
  - *Pendiente demo:* pasar a `WHATSAPP_MODE=bot` + número dedicado + `WHATSAPP_ALLOWED_USERS`.
- **OUTBOUND webhook `pulso-alerts` — VALIDADO end-to-end** (test entregó un WhatsApp real):
  - **URL:** `http://20.230.224.245:8644/webhooks/pulso-alerts` (IP **pública**, NO `localhost`). Health: `http://20.230.224.245:8644/health`.
  - **Secret:** `WEBHOOK_SECRET` en `~/.hermes/.env` (unificado con `--secret` al subscribe).
  - **Formato de destinatario confirmado:** número pelado con código de país, **sin `+`** (ej. `593963146039`).
  - *Gotcha:* el adapter de webhook se habilita por **`config.yaml` top-level `platforms.webhook`**, NO solo por `.env` (un `hermes gateway restart` no relee bien el `.env`). El puerto 8644 está abierto en el NSG de Azure.

---

## 4. 🔴 CORRECCIONES a asunciones previas (leer sí o sí)

1. **El MCP NO es una Edge Function y NO existe `PULSO_MCP_URL`/`PULSO_MCP_TOKEN`.**
   Es un **shim Python `docs/hermes/pulso_mcp.py`** que corre EN LA VM como subproceso de
   Hermes (stdio, `mcp_servers.pulso.command: python`). El shim: recibe el número del
   remitente → busca `whatsapp_config` por teléfono (service role) → **firma un JWT corto de
   Supabase** (HS256, `sub=user_id`, `role=authenticated`, `aud=authenticated`, `exp=+300s`)
   con `SUPABASE_JWT_SECRET` → llama al **`agent-tools` existente** (frozen, NO se toca) con
   ese Bearer. **Este shim es Task 7 de este carril, hay que construirlo.**
   *Fallback:* si el JWT minted da `unauthorized`, apuntar el shim directo a las RPC PostGIS
   (`${SUPABASE_URL}/rest/v1/rpc/<name>`, mismo Bearer).

2. **La `config.yaml` que está en la VM salió de una copia VIEJA** (usaba
   `mcp.servers.pulso.url=${PULSO_MCP_URL}` + SSE + `disabled_toolsets`). La **canónica del
   repo** (`docs/hermes/config.yaml.example`) usa el **shim python + `platform_toolsets.whatsapp: [mcp-pulso]`** (allowlist inclusiva). **Re-alinear la VM a la del repo** al construir el shim.

3. **Firma del webhook:** la VM se configuró con `X-Webhook-Signature-V2` (HMAC-SHA256 de
   `${ts}.${body}`). El plan C1 dice que el `HermesWhatsAppGateway` manda header
   `x-pulso-signature: <secret>` (secret plano). Como **este carril es dueño de ambos extremos**
   (el adapter Y la config del webhook), reconciliar al escribir Task 2 (elegir un esquema y
   que coincidan). El subscribe del plan usa `--deliver "whatsapp:{to}" --deliver-only`.

---

## 5. 🔨 LO QUE FALTA — Tareas de C1 (rama `feat/c1-hermes`)

### Parte A — Repo, rework del outbound (se puede empezar YA, sin gate)
1. **Port `messaging-gateway.ts`:** `sendWhatsApp(input: { to: string; kind: 'proximity'|'sos'|'optin'; context?: Record<string, unknown> }): Promise<{ id: string; status: string }>`.
2. **Adapter `hermes-whatsapp-gateway.ts`:** construir con `{ webhookUrl, secret }`; POST `{ to, kind, ...context }` a `HERMES_WEBHOOK_URL` con header de firma (ver corrección #3).
3. **Use-case `dispatch-proximity-alerts.ts`:** input `{ kind:'proximity'; incidentId; context? } | { kind:'sos'; userId; context? }`; mantener el guard de contactos `accepted` y el fan-out por-contacto.
4. **`proximity-dispatcher/index.ts`:** tres bodies →
   - incident insert `{ record: { id } }` / `{ incidentId }`, guard header `x-pulso-webhook-secret`
   - SOS `{ type:'sos', location:{ lat, lng } }`, guard `Authorization`
   - opt-in `{ optin:{ contactId } }`, guard `Authorization`
   Devuelve `{ dispatched: number }`; escribe `whatsapp_dispatch_log` (idempotencia/audit).
5. **`_shared/env.ts` + root `.env.example`:** AGREGAR `HERMES_WEBHOOK_URL`, `HERMES_WEBHOOK_SECRET`, `PROXIMITY_WEBHOOK_SECRET`; QUITAR `HERMES_API_URL`, `HERMES_API_KEY`, `HERMES_WHATSAPP_FROM`, `WHATSAPP_PROXIMITY_TEMPLATE`, `WHATSAPP_SOS_TEMPLATE`.
6. **ADR-017** en `docs/DECISIONS.md`: agregar nota "Revision (2026-07-21)" (Hermes = agente self-hosted, no REST API). *(Espera "B1+B6 frozen" por ser doc compartido.)*

### Parte B — Shim en la VM (se puede escribir YA)
7. **`docs/hermes/pulso_mcp.py`:** MCP stdio (`mcp.run()`), toolset `mcp-pulso`, tools
   `get_nearby_incidents` / `get_incident_details` / `confirm_incident`, cada una con arg
   `sender` (E.164). Auth = mint JWT (ver corrección #1) y llamar a `agent-tools`.
   Env: `AGENT_TOOLS_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
   Deps: `mcp[cli]`, `pyjwt`.

### Parte C — Runbook manual en la VM (después de tener el shim)
Copiar `SOUL.md` + `pulso_mcp.py` a `~/.hermes/`, **re-alinear `config.yaml`/`.env` a la versión del repo**, `pip install "mcp[cli]" pyjwt`, `hermes config check && hermes doctor`, `hermes tools` (confirmar toolset `mcp-pulso` con las 3 tools), `hermes gateway restart`, smoke test inbound ("¿qué pasa cerca?") y outbound (SOS → revisar `whatsapp_dispatch_log`).

### Deploy cloud (C2 — DESPUÉS de "B1+B6 frozen")
`supabase secrets set` (incl. `HERMES_WEBHOOK_URL`/`_SECRET`/`PROXIMITY_WEBHOOK_SECRET`),
`supabase functions deploy ... proximity-dispatcher`, y **wire del Database Webhook** en
`incidents` INSERT → `proximity-dispatcher` con header `x-pulso-webhook-secret` (en el
Dashboard, no en migración).

---

## 6. Dependencias & secuencia

- **Empezar YA (sin gate):** Tasks A1-A5 + Task B7 (`pulso_mcp.py`). Tocan solo mi carve-out.
- **Espera "B1+B6 frozen":** Task A6 (edita doc compartido) y TODO el deploy cloud (C2).
- **Tablas ya listas** (migración `0002`, frozen): `whatsapp_config`, `emergency_contacts`, `alert_rules`, `whatsapp_dispatch_log`, función `get_alert_matches`.
- **Otros dependen de mí:** F6 (frontend) postea `{ optin:{ contactId } }` y `{ type:'sos', location:{ lat, lng } }` → deben coincidir con los bodies del dispatcher (CONTRACT §4). C2 necesita mis env vars + el header `x-pulso-webhook-secret`.
- **Contrato de tools** (CONTRACT §5, el shim debe matchear byte a byte):
  `get_nearby_incidents({ radius_meters?, filter_category? })` (el caller inyecta `user_lat`/`user_long`),
  `get_incident_details({ incident_id })`,
  `confirm_incident({ incident_id, kind:'confirm'|'dispute' })`.

---

## 7. Valores concretos (referencia rápida)

| Cosa | Valor |
|---|---|
| Repo | `/home/marcwos/Descargas/docs/buildathon_openai` |
| Rama a crear | `feat/c1-hermes` |
| SSH a la VM | `ssh azureuser@20.230.224.245` |
| Webhook outbound | `http://20.230.224.245:8644/webhooks/pulso-alerts` |
| Health | `http://20.230.224.245:8644/health` |
| Secret webhook | `WEBHOOK_SECRET` en `~/.hermes/.env` de la VM |
| Formato `to` WhatsApp | número sin `+` (ej. `593963146039`) |
| Plan rector | `plans/integrations/C1-hermes-chat-integration.md` |

---

## 8. Tu primera acción sugerida

1. Crear rama `feat/c1-hermes` desde `main`.
2. **Leer antes de escribir:** `plans/integrations/C1-hermes-chat-integration.md`, el estado
   actual de `backend/core/ports/messaging-gateway.ts`, `backend/adapters/messaging/hermes-whatsapp-gateway.ts`,
   `backend/core/use-cases/dispatch-proximity-alerts.ts`, `backend/supabase/functions/proximity-dispatcher/index.ts`,
   `backend/supabase/functions/_shared/env.ts`, y `backend/supabase/functions/agent-tools/index.ts` (para replicar el contrato en el shim).
3. Implementar Tasks A1→A5 y B7. Dejar A6 y el deploy C2 para después del gate "B1+B6 frozen".
4. Verificar compilando (no hay tests): `cd backend && <build/typecheck>`.
