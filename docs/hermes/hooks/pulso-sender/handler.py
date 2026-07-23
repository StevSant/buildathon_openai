"""Gateway hook: cache session_id -> WhatsApp sender phone.

Hermes never surfaces the WhatsApp phone number to the model (the session context
prefers the contact's push-name — see upstream issue #35147), so tools that need a
`sender` argument would receive nothing. This hook captures the sender on
`session:start` / `agent:start` (the only gateway events that expose `user_id`) and
persists it per session. The paired shell hook `agent-hooks/inject-sender.sh` reads
it on every `pre_llm_call` and injects it into the turn.

LID RESOLUTION: modern WhatsApp accounts arrive as a privacy alias ("<lid>@lid"),
not the phone JID. Baileys persists the mapping on disk at
~/.hermes/whatsapp/session/lid-mapping-<lid>_reverse.json (lid -> phone), so when
the user_id is a @lid we resolve it there. Tolerant parser: we scan the file for a
digit run that is not the lid itself, so minor format changes don't break us.

Deploy to: ~/.hermes/hooks/pulso-sender/  (gateway loads it automatically on start).
"""

import re
from pathlib import Path

STATE_DIR = Path.home() / ".hermes" / "state" / "pulso-sender"
DEBUG_LOG = Path.home() / ".hermes" / "state" / "pulso-sender-debug.log"
BAILEYS_SESSION = Path.home() / ".hermes" / "whatsapp" / "session"


def _debug(line: str) -> None:
    DEBUG_LOG.parent.mkdir(parents=True, exist_ok=True)
    with DEBUG_LOG.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def _lid_to_phone(lid_digits: str) -> str | None:
    """Resolve a WhatsApp LID to the real phone via Baileys' on-disk mapping."""
    mapping = BAILEYS_SESSION / f"lid-mapping-{lid_digits}_reverse.json"
    if not mapping.exists():
        return None
    text = mapping.read_text(encoding="utf-8", errors="replace")
    for match in re.finditer(r"\d{8,15}", text):
        if match.group(0) != lid_digits:
            return match.group(0)
    return None


def handle(event_type: str, context: dict) -> None:
    platform = str(context.get("platform") or "")
    if platform.lower() != "whatsapp":
        return
    user_id = str(context.get("user_id") or "")
    session_id = str(context.get("session_id") or "")
    if not user_id or not session_id:
        _debug(f"{event_type}: missing user_id/session_id")
        return

    # "593963146039:87@s.whatsapp.net" or "30425632264439@lid" -> bare digits
    bare = user_id.split("@", 1)[0].split(":", 1)[0]
    digits = re.sub(r"\D", "", bare)

    if user_id.endswith("@lid"):
        phone = _lid_to_phone(digits)
        if not phone:
            _debug(f"{event_type}: no lid-mapping for {digits!r}")
            return
        _debug(f"{event_type}: lid {digits} -> phone {phone}")
    else:
        phone = digits
        _debug(f"{event_type}: direct phone {phone}")

    if not 8 <= len(phone) <= 15:
        _debug(f"{event_type}: invalid phone {phone!r}")
        return

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", session_id)
    (STATE_DIR / safe).write_text(f"+{phone}", encoding="utf-8")
