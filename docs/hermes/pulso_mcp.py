"""Pulso MCP shim running locally on the Hermes VM.

It maps a WhatsApp sender to a Pulso account, mints a short-lived authenticated
Supabase JWT, and forwards calls to the frozen `agent-tools` Edge Function.

DEMO MODE (PULSO_DEMO_MODE=1): reads (`get_nearby_incidents`, `get_incident_details`)
return public civic data around a fixed venue center using the service role directly
against the PostGIS RPCs — no sender, no whatsapp_config, no alert_rules needed. This
is the documented fallback for when Hermes does not yet surface the WhatsApp sender to
tool calls. Writes (`confirm_incident`) still require a resolved identity.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt
from mcp.server.fastmcp import FastMCP

AGENT_TOOLS_URL = os.environ["AGENT_TOOLS_URL"]
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Demo mode: skip the per-user identity chain for reads.
DEMO_MODE = os.environ.get("PULSO_DEMO_MODE", "").strip() in ("1", "true", "yes")
DEMO_LAT = float(os.environ.get("PULSO_DEFAULT_LAT", "-1.05458"))   # Portoviejo centro
DEMO_LNG = float(os.environ.get("PULSO_DEFAULT_LNG", "-80.45445"))

mcp = FastMCP("pulso")


def _log(message: str) -> None:
    """MCP stdio servers must log to stderr — stdout carries the protocol."""
    print(f"[pulso-mcp] {message}", file=sys.stderr, flush=True)


def _normalize_sender(sender: str) -> str:
    _log(f"tool called with sender={sender!r}")
    digits = "".join(char for char in sender if char.isdigit())
    if not 8 <= len(digits) <= 15:
        raise ValueError("No pude validar el número de WhatsApp.")
    return f"+{digits}"


def _mint_user_jwt(user_id: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": user_id,
            "role": "authenticated",
            "aud": "authenticated",
            "iat": now,
            "exp": now + 300,
        },
        SUPABASE_JWT_SECRET,
        algorithm="HS256",
    )


def _request_json(
    url: str,
    headers: dict[str, str],
    data: bytes | None = None,
    method: str | None = None,
) -> object:
    request = urllib.request.Request(
        url,
        data=data,
        headers=headers,
        method=method or ("POST" if data else "GET"),
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise ValueError(f"Pulso no pudo completar la consulta ({error.code}): {detail}") from error
    except urllib.error.URLError as error:
        raise ValueError("No pude conectar con Pulso en este momento.") from error


def _updated_row_count(payload: object) -> int:
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict):
        return 1
    return 0


def _rpc_service(name: str, args: dict[str, object]) -> object:
    """Call a PostGIS RPC directly with the service role (demo reads, public data)."""
    return _request_json(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        {
            "content-type": "application/json",
            "apikey": SERVICE_KEY,
            "authorization": f"Bearer {SERVICE_KEY}",
        },
        json.dumps(args).encode("utf-8"),
    )


def _enrich_incident(payload: object) -> object:
    """Flatten the RPC's single-row result and add ready-to-share URLs the agent can
    paste into WhatsApp: photo_url (public report-photos bucket) and map_url (never
    dictate raw coordinates in text — share the link instead)."""
    row = payload[0] if isinstance(payload, list) and payload else payload
    if not isinstance(row, dict):
        return payload
    photo = row.get("photo_path")
    if isinstance(photo, str) and photo:
        row["photo_url"] = f"{SUPABASE_URL}/storage/v1/object/public/report-photos/{photo}"
    lat, lng = row.get("lat"), row.get("lng")
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        row["map_url"] = f"https://maps.google.com/?q={lat},{lng}"
    return row


def _safe_comments(incident_id: str) -> object:
    """Community comments for an incident, anonymous shape (id, body, created_at,
    author_verified). Read directly with the service role: the get_incident_comments RPC
    gates reads on auth.uid(), which this shim (no end-user JWT) does not have. Only
    anonymous fields are selected — author_id is never exposed. Best-effort: returns []
    on failure so the incident details still work even if comments are unavailable."""
    try:
        query = urllib.parse.urlencode(
            {
                "incident_id": f"eq.{incident_id}",
                "select": "id,body,created_at,author:profiles(verified)",
                "order": "created_at.asc",
                "limit": "100",
            }
        )
        rows = _request_json(
            f"{SUPABASE_URL}/rest/v1/incident_comments?{query}",
            {"apikey": SERVICE_KEY, "authorization": f"Bearer {SERVICE_KEY}"},
        )
        if not isinstance(rows, list):
            return []
        return [
            {
                "id": row.get("id"),
                "body": row.get("body"),
                "created_at": row.get("created_at"),
                "author_verified": bool((row.get("author") or {}).get("verified")),
            }
            for row in rows
            if isinstance(row, dict)
        ]
    except Exception as error:  # noqa: BLE001 - comments must never break the details call
        _log(f"comments unavailable for {incident_id}: {error}")
        return []


def _resolve_user_id(sender: str) -> str:
    phone = _normalize_sender(sender)
    query = urllib.parse.urlencode({"select": "user_id", "phone_e164": f"eq.{phone}", "limit": "1"})
    rows = _request_json(
        f"{SUPABASE_URL}/rest/v1/whatsapp_config?{query}",
        {"apikey": SERVICE_KEY, "authorization": f"Bearer {SERVICE_KEY}"},
    )
    if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
        raise ValueError("Tu número no está vinculado a Pulso. Configúralo primero en la app.")
    user_id = rows[0].get("user_id")
    if not isinstance(user_id, str):
        raise ValueError("No pude identificar tu cuenta de Pulso.")
    return user_id


def _resolve_alert_center(user_id: str) -> tuple[float, float]:
    query = urllib.parse.urlencode(
        {
            "user_id": f"eq.{user_id}",
            "enabled": "is.true",
            "center": "not.is.null",
            "order": "created_at.desc",
            "limit": "1",
        }
    )
    document = _request_json(
        f"{SUPABASE_URL}/rest/v1/alert_rules?{query}",
        {
            "apikey": SERVICE_KEY,
            "authorization": f"Bearer {SERVICE_KEY}",
            "accept": "application/geo+json",
        },
    )
    features = document.get("features") if isinstance(document, dict) else None
    geometry = features[0].get("geometry") if isinstance(features, list) and features else None
    coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else None
    if not isinstance(coordinates, list) or len(coordinates) != 2:
        raise ValueError("No tienes una ubicación de alerta activa. Configúrala en Pulso para consultar cerca de ti.")
    lng, lat = coordinates
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        raise ValueError("La ubicación de alerta de Pulso no es válida.")
    return float(lat), float(lng)


def _call_agent_tools(tool: str, arguments: dict[str, object], bearer: str) -> object:
    payload = json.dumps({"tool": tool, "arguments": arguments}).encode("utf-8")
    return _request_json(
        AGENT_TOOLS_URL,
        {"content-type": "application/json", "authorization": f"Bearer {bearer}"},
        payload,
    )


def _identity(sender: str) -> tuple[str, str]:
    user_id = _resolve_user_id(sender)
    return user_id, _mint_user_jwt(user_id)


@mcp.tool()
def opt_out(sender: str) -> object:
    """Disables WhatsApp alerts and declines pending invitations for the sender."""
    phone = _normalize_sender(sender)
    headers = {
        "apikey": SERVICE_KEY,
        "authorization": f"Bearer {SERVICE_KEY}",
        "content-type": "application/json",
        "Prefer": "return=representation",
    }

    config_query = urllib.parse.urlencode({"phone_e164": f"eq.{phone}"})
    config_rows = _request_json(
        f"{SUPABASE_URL}/rest/v1/whatsapp_config?{config_query}",
        headers,
        json.dumps({"enabled": False}).encode("utf-8"),
        method="PATCH",
    )

    invitation_query = urllib.parse.urlencode(
        {
            "phone_e164": f"eq.{phone}",
            # BAJA must stop future SOS alerts too: decline pending AND accepted.
            "opt_in_status": "neq.declined",
        }
    )
    invitation_rows = _request_json(
        f"{SUPABASE_URL}/rest/v1/emergency_contacts?{invitation_query}",
        headers,
        json.dumps({"opt_in_status": "declined"}).encode("utf-8"),
        method="PATCH",
    )

    return {
        "disabled": _updated_row_count(config_rows) > 0,
        "declined_invitations": _updated_row_count(invitation_rows),
    }


@mcp.tool()
def get_nearby_incidents(
    sender: str = "",
    radius_meters: int = 3000,
    filter_category: str | None = None,
) -> object:
    """Returns active incidents near the user (or near the venue center in demo mode)."""
    if DEMO_MODE:
        _log("demo mode: nearby incidents around venue center via service role")
        return _rpc_service(
            "get_nearby_incidents",
            {
                "user_lat": DEMO_LAT,
                "user_long": DEMO_LNG,
                "radius_meters": radius_meters,
                "filter_category": filter_category,
            },
        )
    user_id, bearer = _identity(sender)
    lat, lng = _resolve_alert_center(user_id)
    return _call_agent_tools(
        "get_nearby_incidents",
        {
            "user_lat": lat,
            "user_long": lng,
            "radius_meters": radius_meters,
            "filter_category": filter_category,
        },
        bearer,
    )


@mcp.tool()
def get_incident_details(incident_id: str, sender: str = "") -> object:
    """One incident's details plus community comments. Interpret the comments as a source:
    summarize what neighbors report, note if the author is a verified member."""
    if DEMO_MODE:
        return {
            "incident": _enrich_incident(_rpc_service("get_incident_details", {"target_id": incident_id})),
            "comments": _safe_comments(incident_id),
        }
    _, bearer = _identity(sender)
    return {
        "incident": _call_agent_tools("get_incident_details", {"incident_id": incident_id}, bearer),
        "comments": _safe_comments(incident_id),
    }


@mcp.tool()
def confirm_incident(sender: str, incident_id: str, kind: str = "confirm") -> object:
    """Registers a confirm or dispute vote for an incident (requires a linked number)."""
    _, bearer = _identity(sender)
    vote = "dispute" if kind == "dispute" else "confirm"
    return _call_agent_tools("confirm_incident", {"incident_id": incident_id, "kind": vote}, bearer)


if __name__ == "__main__":
    mcp.run()
