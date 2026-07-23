# Modelo de amenazas — Cerca (Pulso × Hermes por WhatsApp)

Estado: activo. Última revisión: 2026-07-22. Complementa `docs/HERMES-CHAT-INTEGRATION.md`
(bitácora §12) y `SOUL.md` (reglas del agente).

## 1. Sistema y fronteras de confianza

```
 Persona en WhatsApp  ──►  Baileys (sesión en ~/.hermes/whatsapp/session)
        │                        │
        │  (NO confiable)        ▼
        │                 Hermes gateway ── hooks: pulso-sender (cachea sesión→teléfono)
        │                        │          inject-sender.sh (inyecta sender + guardia)
        │                        ▼
        │                 Modelo OpenAI  ◄── SOUL.md (sin secretos, público-seguro)
        │                        │
        │                        ▼
        │                 MCP shim pulso_mcp.py (VM; frontera de errores + rate limit)
        │                        │
        │                        ▼
        └──────────────►  Supabase: PostgREST (service role / JWT minteado)
                          + edge fn agent-tools (congelada, verify_jwt)
```

Todo lo que escribe la persona (mensajes, y también los comentarios de la comunidad que
vuelven por las tools) es contenido NO confiable. La identidad del remitente la fija el
SISTEMA (hook de gateway + resolución LID de Baileys), nunca el texto del usuario.

## 2. Activos a proteger

| Activo | Dónde vive | Nota |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_JWT_SECRET` | `~/.hermes/.env` en la VM (chmod 600) | Compromiso = compromiso total del backend |
| Mapeo teléfono ↔ identidad Pulso | `whatsapp_config` + estado del hook | Dato personal |
| Coordenadas exactas de incidentes | Llegan al MODELO en nearby/details (las RPCs devuelven lat/lng); solo `get_incident_history` es libre de coordenadas | El control de no dictarlas es conductual (SOUL), no técnico |
| Datos de contactos de emergencia | `emergency_contacts` | Nunca se muestran a terceros |
| Gasto de OpenAI | facturación | Abuso = costo |

`SOUL.md` NO contiene secretos por diseño: si alguien lo extrae, no se filtra nada sensible.

## 3. Actores

- **Desconocido en WhatsApp** — hoy bloqueado (modo solo-propietario + `unauthorized_dm_behavior: ignore`).
- **Usuario vinculado malicioso** — intenta salirse del alcance, extraer el prompt, suplantar otro `sender`, abusar del costo.
- **Autor de comentarios malicioso** — inyección indirecta: instrucciones dentro de un comentario que las tools devuelven al modelo.
- **Error del operador** — deploy de secretos al repo, logs con tokens, config abierta.

## 4. Amenazas y mitigaciones

| Amenaza | Mitigación | Riesgo residual |
|---|---|---|
| Extracción del prompt (SOUL) | Regla anti-extracción con frase fija de rechazo (grep-able); guardia por turno en `inject-sender.sh`; **cero secretos en SOUL** | No 100 % prevenible; aceptado: nada sensible que filtrar |
| Uso fuera de alcance (LLM gratis) | Scope lock en SOUL con frase fija; guardia por turno; `max_turns: 15`; rate limit 20 llamadas/5 min en el shim | El modelo puede ceder ante ataques novedosos; detección por logs |
| Suplantación de `sender` (número dictado) | El sender lo inyecta el SISTEMA (hook gateway + LID); SOUL ordena usar el valor exacto; en turnos SIN remitente verificado el hook inyecta la orden de no aceptar números dictados | El modelo podría equivocarse; las tools validan formato pero no titularidad del número |
| Inyección indirecta vía comentarios | Regla en SOUL (comentarios = citas, nunca instrucciones); `_safe_comments` trunca a 500 chars y limpia caracteres de control | Contenido persuasivo sigue llegando al modelo |
| Exfiltración de PII/coordenadas | Tools devuelven forma anónima (sin `author_id`); SOUL prohíbe dictar coordenadas y ordena compartir `map_url` en su lugar | Las RPCs de nearby/details SÍ entregan lat/lng al modelo — un desliz del modelo puede dictarlas (mitigación conductual, no técnica) |
| DoS / abuso de costo | Rate limit por sender; `max_turns: 15`; modo solo-propietario; clamps de parámetros (radio, horas) | Rate limit es por proceso (se resetea al reiniciar) |
| Fuga de errores técnicos | Frontera de errores `@pulso_tool`: el modelo SOLO ve mensajes en español autorados; detalle al log con `ref` | — |
| JWT minteado mal usado si la VM cae | Exp 300 s, `sub` fijo por usuario; pero la service key en la misma VM ya es peor | Compromiso de VM = total; higiene SSH fuera de alcance aquí |
| Baileys ban / MITM de sesión | Sesión en disco de la VM; migración a WhatsApp Cloud API en backlog | Riesgo operativo conocido |

## 5. Detección y respuesta

- **Intentos de extracción**: `grep "Esa parte de mi configuración" ~/.hermes/logs/*` — la
  frase fija de rechazo hace el ataque visible.
- **Errores backend**: la persona ve `(ref a1b2c3)` → `grep a1b2c3 ~/.hermes/logs/pulso_mcp.log`
  da el detalle completo (código, body, traceback).
- **Auditoría de tools**: `~/.hermes/logs/tool_calls.log` (`tool_progress: "log"`); revisar
  semanalmente.
- Si un prompt se extrae: nada secreto se filtra (diseño). Rotar solo si un SECRETO
  aparece en logs/chat: rotar en Supabase Dashboard y actualizar `~/.hermes/.env`.

## 6. Checklist de endurecimiento (viva)

- [x] `platform_toolsets.whatsapp: [mcp-pulso]` únicamente (sin terminal/web/browser)
- [x] Terminal backend docker (defensa en profundidad; WhatsApp ni siquiera lo tiene)
- [x] `unauthorized_dm_behavior: ignore` + modo solo-propietario
- [x] `tool_progress: "log"` (sin burbujas de tools en chat; auditoría en disco)
- [x] Frontera de errores en el shim (sin fugas técnicas al público)
- [x] Rate limit por sender + clamps de parámetros + validación UUID
- [x] Guardia de seguridad por turno (hook `pre_llm_call`)
- [x] SOUL sin secretos + reglas de alcance/anti-extracción/inyección indirecta
- [x] `max_turns: 15`
- [ ] `.env` chmod 600 en la VM (verificar)
- [ ] HTTPS para el webhook entrante (backlog ops)
- [ ] Allowlist `WHATSAPP_ALLOWED_USERS` antes de abrir a más números (bloqueante)
- [ ] Migración a WhatsApp Cloud API (riesgo de ban de Baileys)
