"""Gateway hook: cache session_id -> WhatsApp sender phone.

Hermes never surfaces the WhatsApp phone number to the model (the session context
prefers the contact's push-name — see upstream issue #35147), so tools that need a
`sender` argument would receive nothing. This hook captures the sender's JID on
`session:start` / `agent:start` (the only gateway events that expose `user_id`) and
persists it per session. The paired shell hook `agent-hooks/inject-sender.sh` reads
it on every `pre_llm_call` and injects it into the turn so the model can pass it to
the Pulso MCP tools.

Deploy to: ~/.hermes/hooks/pulso-sender/  (gateway loads it automatically on start).
"""

import re
from pathlib import Path

STATE_DIR = Path.home() / ".hermes" / "state" / "pulso-sender"


def handle(event_type: str, context: dict) -> None:
    if context.get("platform") != "whatsapp":
        return
    user_id = context.get("user_id")
    session_id = context.get("session_id")
    if not user_id or not session_id:
        return
    # WhatsApp JIDs look like "593963146039@s.whatsapp.net" — keep the digits.
    digits = re.sub(r"\D", "", str(user_id).split("@", 1)[0])
    if not 8 <= len(digits) <= 15:
        return
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", str(session_id))
    (STATE_DIR / safe).write_text(f"+{digits}", encoding="utf-8")
