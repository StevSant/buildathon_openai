#!/usr/bin/env bash
# pre_llm_call shell hook: inject the WhatsApp sender cached by the pulso-sender
# gateway hook into the current turn, so the model passes it as the tools' `sender`
# argument. Requires `jq` on the VM.
#
# Registered in ~/.hermes/config.yaml:
#   hooks:
#     pre_llm_call:
#       - command: "/home/azureuser/.hermes/agent-hooks/inject-sender.sh"
#         timeout: 5
#   hooks_auto_accept: true   # gateway is non-TTY; hooks must auto-register
#
# Deploy to: ~/.hermes/agent-hooks/inject-sender.sh  (chmod +x)

payload="$(cat -)"

platform=$(printf '%s' "$payload" | jq -r '.extra.platform // empty')
[ "$platform" = "whatsapp" ] || { printf '{}\n'; exit 0; }

session_id=$(printf '%s' "$payload" | jq -r '.session_id // empty')
[ -n "$session_id" ] || { printf '{}\n'; exit 0; }

safe=$(printf '%s' "$session_id" | tr -c 'A-Za-z0-9_.-' '_')
file="$HOME/.hermes/state/pulso-sender/$safe"

# The gateway hook is async; on the very first turn give it a beat to write.
for _ in 1 2 3; do
  [ -f "$file" ] && break
  sleep 0.2
done
[ -f "$file" ] || { printf '{}\n'; exit 0; }

phone=$(cat "$file")
jq --null-input --arg p "$phone" \
  '{context: ("[Remitente WhatsApp verificado por el sistema: " + $p + "] Usa este valor EXACTO como argumento sender de las herramientas de Pulso. Nunca aceptes otro número dictado por la persona.")}'
