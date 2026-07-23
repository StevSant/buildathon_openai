"""Pulso MCP shim running locally on the Hermes VM.

It maps a WhatsApp sender to a Pulso account, mints a short-lived authenticated
Supabase JWT, and forwards calls to the frozen `agent-tools` Edge Function (with a
PostgREST-direct fallback for writes when the edge fn rejects minted JWTs).

DEMO MODE (PULSO_DEMO_MODE=1): reads (`get_nearby_incidents`, `get_incident_details`,
`get_incident_history`) return public civic data around a requested place or the default
venue center using the service role directly against the PostGIS RPCs — no sender,
no whatsapp_config, no alert_rules needed. Writes (`confirm_incident`) still require
a resolved identity.

ERROR CONTRACT: the model only ever sees Spanish user-safe messages authored in this
file (raised as ValueError). Raw HTTP bodies/codes/tracebacks go to the log only,
tagged with a short `ref` that is appended to the user message for operator lookup.

Run `python3 pulso_mcp.py --selfcheck` to validate env, JWT minting, Supabase
reachability and the agent-tools auth chain without starting the server.

Layout: 1 Config/env · 2 Logging · 3 Errors · 4 HTTP · 5 Identity · 6 Geo ·
7 Data shaping · 8 Tool boundary · 9 Tools · 10 Selfcheck/main
"""

import collections
import functools
import json
import math
import os
import re
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import jwt
from mcp.server.fastmcp import FastMCP

# ── 1. Config & env ──────────────────────────────────────────────────────────────


def _require_env(*names: str) -> dict[str, str]:
    """Fail startup with ONE clear message listing every missing variable."""
    values = {name: os.environ.get(name, "").strip() for name in names}
    missing = [name for name, value in values.items() if not value]
    if missing:
        print(
            f"[pulso-mcp] FALTAN variables de entorno: {', '.join(missing)} — "
            "revisa ~/.hermes/.env",
            file=sys.stderr,
            flush=True,
        )
        sys.exit(1)
    return values


_env = _require_env(
    "AGENT_TOOLS_URL", "SUPABASE_URL", "SUPABASE_JWT_SECRET", "SUPABASE_SERVICE_ROLE_KEY"
)
AGENT_TOOLS_URL = _env["AGENT_TOOLS_URL"]
SUPABASE_URL = _env["SUPABASE_URL"].rstrip("/")
SUPABASE_JWT_SECRET = _env["SUPABASE_JWT_SECRET"]
SERVICE_KEY = _env["SUPABASE_SERVICE_ROLE_KEY"]

# Demo mode: skip the per-user identity chain for reads.
DEMO_MODE = os.environ.get("PULSO_DEMO_MODE", "").strip() in ("1", "true", "yes")
# Kill-switch: make the PostgREST-direct RPC the PRIMARY path for confirm_incident
# (set it once diagnosis shows the frozen edge fn rejects minted JWTs).
CONFIRM_VIA_POSTGREST = os.environ.get("PULSO_CONFIRM_VIA_POSTGREST", "").strip() in (
    "1",
    "true",
    "yes",
)
DEMO_LAT = float(os.environ.get("PULSO_DEFAULT_LAT", "-1.05458"))   # Portoviejo centro
DEMO_LNG = float(os.environ.get("PULSO_DEFAULT_LNG", "-80.45445"))
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_USER_AGENT = "pulso-demo/1.0"
# Manabí-wide bias (west,north,east,south): covers Portoviejo, Manta and surroundings,
# so asking about another Manabí city resolves THERE instead of silently failing.
MANABI_VIEWBOX = "-80.95,-0.75,-80.25,-1.35"

RATE_MAX_CALLS = 20
RATE_WINDOW_SECONDS = 300

mcp = FastMCP("pulso")

# ── 2. Logging ───────────────────────────────────────────────────────────────────

LOG_FILE = Path.home() / ".hermes" / "logs" / "pulso_mcp.log"


def _log(message: str) -> None:
    """MCP stdio servers must log to stderr — stdout carries the protocol.
    Also appended (best-effort) to ~/.hermes/logs/pulso_mcp.log for `grep ref=`.
    RULE: never log full JWTs or API keys — prefixes only."""
    print(f"[pulso-mcp] {message}", file=sys.stderr, flush=True)
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as fh:
            fh.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {message}\n")
    except OSError:
        pass  # logging must never break a tool call


def _new_ref() -> str:
    """Short correlation ref shown to the user and greppable in the log."""
    return os.urandom(3).hex()


# ── 3. Error taxonomy ────────────────────────────────────────────────────────────


class PulsoError(Exception):
    """Tool failure with a user-safe Spanish message and an operator-only detail.

    kinds: connectivity | not_found | auth | invalid_input | unknown
    `detail` (HTTP body/code/traceback) is ONLY ever logged, never surfaced."""

    def __init__(self, kind: str, user_message: str, detail: str = "") -> None:
        super().__init__(user_message)
        self.kind = kind
        self.user_message = user_message
        self.detail = detail
        self.ref = _new_ref()

    def public_message(self) -> str:
        # invalid_input / not_found are self-explanatory to the person; the rest
        # carry the ref so the operator can grep the log from a screenshot.
        if self.kind in ("invalid_input", "not_found"):
            return self.user_message
        return f"{self.user_message} (ref {self.ref})"


# ── 4. HTTP layer ────────────────────────────────────────────────────────────────


def _request_json(
    url: str,
    headers: dict[str, str],
    data: bytes | None = None,
    method: str | None = None,
) -> object:
    """JSON request. Failures are classified into PulsoError — the raw HTTP body
    NEVER reaches the model, only the log."""
    request = urllib.request.Request(
        url,
        data=data,
        headers=headers,
        method=method or ("POST" if data else "GET"),
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")[:500]
        if error.code in (401, 403):
            kind, message = "auth", "No pude validar tu acceso a Pulso."
        elif error.code == 404 or "PGRST202" in body:
            kind, message = "not_found", "Esa consulta no está disponible por ahora."
        else:
            kind, message = "unknown", "Pulso tuvo un problema procesando la consulta."
        raise PulsoError(kind, message, detail=f"HTTP {error.code} {url}: {body}") from error
    except urllib.error.URLError as error:
        raise PulsoError(
            "connectivity",
            "No pude conectar con Pulso en este momento. Intenta de nuevo en un minuto.",
            detail=f"{url}: {error}",
        ) from error
    try:
        return json.loads(body)
    except ValueError as error:
        # A 200 with a non-JSON body (proxy page, misconfigured URL) must not leak
        # "Expecting value: line 1…" to the model — JSONDecodeError IS a ValueError.
        raise PulsoError(
            "unknown",
            "Pulso tuvo un problema procesando la consulta.",
            detail=f"{url}: non-JSON 200 response: {body[:200]}",
        ) from error


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


def _rpc_user(name: str, args: dict[str, object], bearer: str) -> object:
    """Call a PostgREST RPC as the END USER: PostgREST validates the minted JWT's
    signature and sets auth.uid() from `sub` — no gotrue session needed. This is the
    fallback when the frozen agent-tools edge fn rejects minted (non-session) JWTs."""
    return _request_json(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        {
            "content-type": "application/json",
            "apikey": SERVICE_KEY,
            "authorization": f"Bearer {bearer}",
        },
        json.dumps(args).encode("utf-8"),
    )


def _call_agent_tools(tool: str, arguments: dict[str, object], bearer: str) -> object:
    payload = json.dumps({"tool": tool, "arguments": arguments}).encode("utf-8")
    return _request_json(
        AGENT_TOOLS_URL,
        {"content-type": "application/json", "authorization": f"Bearer {bearer}"},
        payload,
    )


# ── 5. Identity ──────────────────────────────────────────────────────────────────


def _normalize_sender(sender: str) -> str:
    digits = "".join(char for char in sender if char.isdigit())
    # Phone numbers are PII — log a masked form only.
    _log(f"tool called with sender=…{digits[-4:] if digits else '<none>'}")
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


def _phone_match_filter(phone: str) -> str:
    """PostgREST or-filter matching phone_e164 stored with or without the leading '+'."""
    digits = phone.lstrip("+")
    return f"(phone_e164.eq.+{digits},phone_e164.eq.{digits})"


def _resolve_user_id(sender: str) -> str:
    phone = _normalize_sender(sender)
    query = urllib.parse.urlencode(
        {"select": "user_id", "or": _phone_match_filter(phone), "limit": "1"}
    )
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


def _identity(sender: str) -> tuple[str, str]:
    user_id = _resolve_user_id(sender)
    return user_id, _mint_user_jwt(user_id)


# ── 6. Geo ───────────────────────────────────────────────────────────────────────


def _geocode(place: str) -> tuple[float, float] | None:
    """Resolve a Manabí place with Nominatim without surfacing lookup failures."""
    if not place.strip():
        return None
    query = urllib.parse.urlencode(
        {
            "q": f"{place.strip()}, Manabí, Ecuador",
            "format": "json",
            "limit": "1",
            "viewbox": MANABI_VIEWBOX,
        }
    )
    request = urllib.request.Request(
        f"{NOMINATIM_URL}?{query}",
        headers={
            "Accept": "application/json",
            "User-Agent": NOMINATIM_USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            results = json.load(response)
        if not isinstance(results, list) or not results or not isinstance(results[0], dict):
            return None
        latitude = float(results[0]["lat"])
        longitude = float(results[0]["lon"])
        if not (
            math.isfinite(latitude)
            and math.isfinite(longitude)
            and -90 <= latitude <= 90
            and -180 <= longitude <= 180
        ):
            return None
        return latitude, longitude
    except Exception as error:  # noqa: BLE001 - geocoding is a best-effort fallback
        _log(f"geocoding unavailable for {place!r}: {error}")
        return None


def _resolve_point(
    place: str | None, lat: float | None, lng: float | None
) -> tuple[tuple[float, float] | None, str]:
    """Shared location resolution for zone queries, carrying the `queried_around`
    honesty contract: never silently answer from the default center when the person
    asked about a specific place we could not locate."""
    if lat is None and lng is None:
        resolved = _geocode(place) if place else None
    elif (
        isinstance(lat, (int, float))
        and not isinstance(lat, bool)
        and isinstance(lng, (int, float))
        and not isinstance(lng, bool)
        and math.isfinite(float(lat))
        and math.isfinite(float(lng))
        and -90 <= float(lat) <= 90
        and -180 <= float(lng) <= 180
    ):
        resolved = (float(lat), float(lng))
    else:
        raise ValueError("Debes proporcionar latitud y longitud válidas juntas.")

    if place and resolved is None:
        raise ValueError(
            "No pude ubicar ese lugar. Prueba con otra referencia conocida "
            "(un parque, avenida, barrio o ciudad de Manabí)."
        )

    source = "place" if place else ("coordinates" if resolved else "default_center")
    return resolved, source


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


# ── 7. Data shaping ──────────────────────────────────────────────────────────────

_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _require_uuid(incident_id: str) -> str:
    """Validate before any backend round-trip — a hallucinated id fails fast."""
    incident_id = str(incident_id).strip()
    if not _UUID_RE.match(incident_id):
        raise ValueError("Ese identificador de incidente no es válido.")
    return incident_id


def _clamp(value: object, low: int, high: int, default: int) -> int:
    try:
        number = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return max(low, min(high, number))


def _updated_row_count(payload: object) -> int:
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict):
        return 1
    return 0


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


def _safe_incident_detail(incident_id: str) -> object:
    """One incident's public-safe fields read directly with the service role.
    The get_incident_details RPC gates on auth.uid() (migration 0008), so the shim's
    service-role demo reads always got ZERO rows — photo/map never surfaced. Same
    pattern as _safe_comments: direct table read, never selecting reporter_id. The
    GeoJSON accept header yields the point's coordinates for map_url."""
    query = urllib.parse.urlencode(
        {
            "id": f"eq.{incident_id}",
            "select": "id,title,description,category,severity,status,confirmations,"
            "created_at,expires_at,photo_path,location",
        }
    )
    document = _request_json(
        f"{SUPABASE_URL}/rest/v1/incidents?{query}",
        {
            "apikey": SERVICE_KEY,
            "authorization": f"Bearer {SERVICE_KEY}",
            "accept": "application/geo+json",
        },
    )
    features = document.get("features") if isinstance(document, dict) else None
    if not isinstance(features, list) or not features or not isinstance(features[0], dict):
        return []
    row = dict(features[0].get("properties") or {})
    geometry = features[0].get("geometry")
    coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else None
    if isinstance(coordinates, list) and len(coordinates) == 2:
        row["lng"], row["lat"] = coordinates  # GeoJSON order is [lng, lat]
    return row


def _safe_comments(incident_id: str) -> object:
    """Community comments for an incident, anonymous shape (id, body, created_at,
    author_verified). Read directly with the service role: the get_incident_comments RPC
    gates reads on auth.uid(), which this shim (no end-user JWT) does not have. Only
    anonymous fields are selected — author_id is never exposed. Bodies are truncated and
    stripped of control characters (untrusted user content — indirect-injection surface).
    Best-effort: returns [] on failure so incident details still work without comments."""
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
                "body": _CONTROL_CHARS_RE.sub("", str(row.get("body") or ""))[:500],
                "created_at": row.get("created_at"),
                "author_verified": bool((row.get("author") or {}).get("verified")),
            }
            for row in rows
            if isinstance(row, dict)
        ]
    except Exception as error:  # noqa: BLE001 - comments must never break the details call
        _log(f"comments unavailable for {incident_id}: {error}")
        return []


# ── 8. Tool boundary ─────────────────────────────────────────────────────────────

# ponytail: per-process in-memory rate limit — fine for a single-VM stdio server;
# move to a shared store only if the shim ever runs replicated.
_rate_buckets: dict[str, collections.deque] = {}


def _rate_check(sender: str) -> None:
    digits = "".join(char for char in sender if char.isdigit())
    # Only plausible phone numbers get their own bucket — a model steered into
    # inventing sender values can't mint fresh buckets to bypass the limit.
    key = digits if 8 <= len(digits) <= 15 else "global"
    if len(_rate_buckets) > 500:  # ponytail: crude bound; enough for owner-only mode
        _rate_buckets.clear()
    now = time.monotonic()
    bucket = _rate_buckets.setdefault(key, collections.deque())
    while bucket and now - bucket[0] > RATE_WINDOW_SECONDS:
        bucket.popleft()
    if len(bucket) >= RATE_MAX_CALLS:
        raise ValueError("Demasiadas consultas seguidas; espera un momento e intenta de nuevo.")
    bucket.append(now)


def pulso_tool(friendly: str):
    """Error boundary for every tool. Invariant: the model can only ever see
    user_message strings authored in Spanish in this file.

    - PulsoError → detail logged with ref, public_message() surfaced.
    - ValueError → authored user-safe message; passes through untouched.
    - anything else → traceback logged with ref, per-tool `friendly` surfaced."""

    def wrap(fn):
        @functools.wraps(fn)
        def inner(*args, **kwargs):
            _rate_check(str(kwargs.get("sender") or ""))
            try:
                return fn(*args, **kwargs)
            except PulsoError as error:
                _log(f"{fn.__name__} [{error.kind}] ref={error.ref}: {error.detail}")
                raise ValueError(error.public_message()) from None
            except ValueError:
                raise
            except Exception:
                ref = _new_ref()
                _log(f"{fn.__name__} [unexpected] ref={ref}: {traceback.format_exc()}")
                raise ValueError(f"{friendly} (ref {ref})") from None

        return mcp.tool()(inner)

    return wrap


# ── 9. Tools ─────────────────────────────────────────────────────────────────────


@pulso_tool("No pude procesar tu baja en este momento; escribe BAJA de nuevo en unos minutos.")
def opt_out(sender: str) -> object:
    """Disables WhatsApp alerts and revokes active invitations for the sender."""
    phone = _normalize_sender(sender)
    headers = {
        "apikey": SERVICE_KEY,
        "authorization": f"Bearer {SERVICE_KEY}",
        "content-type": "application/json",
        "Prefer": "return=representation",
    }

    config_query = urllib.parse.urlencode({"or": _phone_match_filter(phone)})
    config_rows = _request_json(
        f"{SUPABASE_URL}/rest/v1/whatsapp_config?{config_query}",
        headers,
        json.dumps({"enabled": False}).encode("utf-8"),
        method="PATCH",
    )

    invitation_query = urllib.parse.urlencode(
        {
            "or": _phone_match_filter(phone),
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


@pulso_tool("No pude procesar tu aceptación en este momento; intenta de nuevo en unos minutos.")
def accept_invitation(sender: str) -> object:
    """Accepts pending emergency-contact invitations for the sender."""
    phone = _normalize_sender(sender)
    headers = {
        "apikey": SERVICE_KEY,
        "authorization": f"Bearer {SERVICE_KEY}",
        "content-type": "application/json",
        "Prefer": "return=representation",
    }
    query = urllib.parse.urlencode(
        {
            "or": _phone_match_filter(phone),
            "opt_in_status": "eq.pending",
        }
    )
    rows = _request_json(
        f"{SUPABASE_URL}/rest/v1/emergency_contacts?{query}",
        headers,
        json.dumps({"opt_in_status": "accepted"}).encode("utf-8"),
        method="PATCH",
    )
    return {"accepted_count": _updated_row_count(rows)}


@pulso_tool("No pude consultar los incidentes cercanos en este momento.")
def get_nearby_incidents(
    sender: str = "",
    radius_meters: int = 3000,
    filter_category: str | None = None,
    place: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
) -> object:
    """Returns active incidents near explicit coordinates, a place, or the configured center."""
    radius_meters = _clamp(radius_meters, 100, 20000, 3000)
    resolved, source = _resolve_point(place, lat, lng)

    if DEMO_MODE:
        query_lat, query_lng = resolved or (DEMO_LAT, DEMO_LNG)
        _log(f"demo mode: nearby incidents via service role ({source})")
        return {
            "queried_around": {"source": source, "place": place or None, "radius_meters": radius_meters},
            "incidents": _rpc_service(
                "get_nearby_incidents",
                {
                    "user_lat": query_lat,
                    "user_long": query_lng,
                    "radius_meters": radius_meters,
                    "filter_category": filter_category,
                },
            ),
        }
    user_id, bearer = _identity(sender)
    if resolved is None:
        try:
            resolved = _resolve_alert_center(user_id)
        except (ValueError, PulsoError) as error:
            _log(f"alert center unavailable; using default center: {error}")
            resolved = (DEMO_LAT, DEMO_LNG)
    query_lat, query_lng = resolved
    return _call_agent_tools(
        "get_nearby_incidents",
        {
            "user_lat": query_lat,
            "user_long": query_lng,
            "radius_meters": radius_meters,
            "filter_category": filter_category,
        },
        bearer,
    )


@pulso_tool("No pude consultar el historial de esa zona en este momento.")
def get_incident_history(
    sender: str = "",
    radius_meters: int = 3000,
    since_hours: int = 168,
    place: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
) -> object:
    """Past incidents (resolved or expired) near a place or coordinates, newest first.
    Use when asked about what HAS happened in a zone, not what is happening now."""
    radius_meters = _clamp(radius_meters, 100, 20000, 3000)
    since_hours = _clamp(since_hours, 1, 720, 168)
    resolved, source = _resolve_point(place, lat, lng)

    if resolved is None and not DEMO_MODE:
        try:
            resolved = _resolve_alert_center(_resolve_user_id(sender))
            source = "alert_center"
        except (ValueError, PulsoError) as error:
            _log(f"alert center unavailable; using default center: {error}")
    query_lat, query_lng = resolved or (DEMO_LAT, DEMO_LNG)
    # get_incident_history is a new RPC unknown to the frozen agent-tools edge fn,
    # so both modes call it directly via the service role (the RPC is anonymous,
    # bounded to 100 rows and returns no exact coordinates by design).
    return {
        "queried_around": {"source": source, "place": place or None, "radius_meters": radius_meters},
        "incidents": _rpc_service(
            "get_incident_history",
            {
                "user_lat": query_lat,
                "user_long": query_lng,
                "radius_meters": radius_meters,
                "since_hours": since_hours,
            },
        ),
    }


@pulso_tool("No pude consultar ese incidente en este momento.")
def get_incident_details(incident_id: str, sender: str = "") -> object:
    """One incident's details plus community comments. Interpret the comments as a source:
    summarize what neighbors report, note if the author is a verified member."""
    incident_id = _require_uuid(incident_id)
    if DEMO_MODE:
        # NOT the RPC: it gates on auth.uid() and returns zero rows for service-role
        # callers (see _safe_incident_detail) — read the table directly instead.
        return {
            "incident": _enrich_incident(_safe_incident_detail(incident_id)),
            "comments": _safe_comments(incident_id),
        }
    _, bearer = _identity(sender)
    return {
        "incident": _call_agent_tools("get_incident_details", {"incident_id": incident_id}, bearer),
        "comments": _safe_comments(incident_id),
    }


def _map_confirm_error(error: PulsoError) -> PulsoError:
    """Translate known confirm_incident RPC/edge-fn errors (present in the raw detail)
    into specific friendly messages. Unknown errors return the original."""
    detail = error.detail
    if "reporter cannot vote" in detail:
        return PulsoError("invalid_input", "No puedes confirmar ni disputar tu propio reporte.", detail)
    if "incident not found" in detail:
        return PulsoError("not_found", "No encontré ese incidente; puede que ya haya expirado.", detail)
    if "account disabled" in detail:
        return PulsoError("auth", "Tu cuenta de Pulso está desactivada.", detail)
    return error


def _confirm_via_postgrest(incident_id: str, vote: str, bearer: str) -> object:
    try:
        # NOTE: the RPC parameter is `target_id`, not `incident_id` (migration 0008).
        rows = _rpc_user("confirm_incident", {"target_id": incident_id, "kind": vote}, bearer)
    except PulsoError as error:
        raise _map_confirm_error(error) from None
    return rows[0] if isinstance(rows, list) and rows else rows


@pulso_tool("No pude registrar tu confirmación en este momento.")
def confirm_incident(sender: str, incident_id: str, kind: str = "confirm") -> object:
    """Registers a confirm or dispute vote for an incident (requires a linked number)."""
    incident_id = _require_uuid(incident_id)
    _, bearer = _identity(sender)
    vote = "dispute" if kind == "dispute" else "confirm"
    if CONFIRM_VIA_POSTGREST:
        return _confirm_via_postgrest(incident_id, vote, bearer)
    try:
        return _call_agent_tools("confirm_incident", {"incident_id": incident_id, "kind": vote}, bearer)
    except PulsoError as error:
        mapped = _map_confirm_error(error)
        if mapped is not error:
            raise mapped from None
        if error.kind != "auth":
            raise
        # The frozen edge fn rejected the minted JWT (gateway verify_jwt or gotrue
        # getUser). PostgREST validates the signature itself and the RPC re-checks
        # everything (auth.uid(), active profile, self-vote) — no control is lost.
        _log(f"agent-tools rechazó el JWT minteado (ref={error.ref}); fallback PostgREST directo")
        return _confirm_via_postgrest(incident_id, vote, bearer)


# ── 10. Selfcheck & main ─────────────────────────────────────────────────────────


def _probe(url: str, headers: dict[str, str], data: bytes | None = None) -> tuple[int, str]:
    """Raw status+body probe for selfcheck (never raises, never logs secrets)."""
    request = urllib.request.Request(
        url, data=data, headers=headers, method="POST" if data else "GET"
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, response.read().decode("utf-8", "replace")[:300]
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")[:300]
    except Exception as error:  # noqa: BLE001 - selfcheck reports, never crashes
        return 0, str(error)[:300]


def _selfcheck() -> int:
    """OK/FAIL per check; exit non-zero on any FAIL. Never prints secret values."""
    failures = 0

    def report(ok: bool, name: str, note: str = "") -> None:
        nonlocal failures
        print(f"{'OK  ' if ok else 'FAIL'} {name}" + (f" — {note}" if note else ""))
        if not ok:
            failures += 1

    report(True, "env", "AGENT_TOOLS_URL, SUPABASE_URL, SUPABASE_JWT_SECRET, SERVICE_KEY presentes")

    try:
        token = _mint_user_jwt("00000000-0000-0000-0000-000000000000")
        jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
        report(True, "jwt", "mint + decode HS256 round-trip")
    except Exception as error:  # noqa: BLE001
        report(False, "jwt", str(error)[:120])

    code, _body = _probe(f"{SUPABASE_URL}/rest/v1/", {"apikey": SERVICE_KEY})
    report(code == 200, "supabase-rest", f"HTTP {code}")

    service_headers = {
        "content-type": "application/json",
        "apikey": SERVICE_KEY,
        "authorization": f"Bearer {SERVICE_KEY}",
    }
    code, body = _probe(
        f"{SUPABASE_URL}/rest/v1/rpc/get_nearby_incidents",
        service_headers,
        json.dumps(
            {"user_lat": DEMO_LAT, "user_long": DEMO_LNG, "radius_meters": 3000, "filter_category": None}
        ).encode("utf-8"),
    )
    report(code == 200, "rpc get_nearby_incidents", f"HTTP {code}")

    code, body = _probe(
        f"{SUPABASE_URL}/rest/v1/rpc/get_incident_history",
        service_headers,
        json.dumps(
            {"user_lat": DEMO_LAT, "user_long": DEMO_LNG, "radius_meters": 3000, "since_hours": 168}
        ).encode("utf-8"),
    )
    if code == 404 or "PGRST202" in body:
        report(False, "rpc get_incident_history", "no existe: migración 0010 sin aplicar o schema cache (NOTIFY pgrst, 'reload schema')")
    else:
        report(code == 200, "rpc get_incident_history", f"HTTP {code}")

    # agent-tools auth-chain classification with a REAL linked user when available.
    probe_sub = "00000000-0000-0000-0000-000000000000"
    code, body = _probe(
        f"{SUPABASE_URL}/rest/v1/whatsapp_config?select=user_id&limit=1",
        {"apikey": SERVICE_KEY, "authorization": f"Bearer {SERVICE_KEY}"},
    )
    try:
        rows = json.loads(body)
        if isinstance(rows, list) and rows and isinstance(rows[0], dict):
            probe_sub = rows[0].get("user_id") or probe_sub
    except ValueError:
        pass
    code, body = _probe(
        AGENT_TOOLS_URL,
        {"content-type": "application/json", "authorization": f"Bearer {_mint_user_jwt(probe_sub)}"},
        json.dumps(
            {
                "tool": "get_nearby_incidents",
                "arguments": {"user_lat": DEMO_LAT, "user_long": DEMO_LNG, "radius_meters": 1000},
            }
        ).encode("utf-8"),
    )
    real_user = probe_sub != "00000000-0000-0000-0000-000000000000"
    if code == 200:
        report(True, "agent-tools", "acepta JWTs minteados — confirm usará el edge fn")
    elif code == 401 and not real_user:
        # A 401 for the sentinel sub is ambiguous: the USER doesn't exist, so this
        # says nothing about whether minted JWTs for real users are accepted.
        report(True, "agent-tools", "401 con usuario centinela (no diagnóstico) — vincula un número en whatsapp_config y repite el selfcheck")
    elif code == 401 and "unauthorized" in body:
        report(True, "agent-tools", "getUser() rechaza JWT minteado — confirm usará el fallback PostgREST")
    elif code == 401:
        report(True, "agent-tools", "gateway verify_jwt rechaza el JWT — confirm usará el fallback PostgREST (verifica SUPABASE_JWT_SECRET si el fallback también falla)")
    else:
        report(False, "agent-tools", f"HTTP {code}: {body[:120]}")

    if _geocode("Portoviejo"):
        print("OK   geocode — Nominatim responde")
    else:
        print("WARN geocode — Nominatim no disponible (no bloqueante)")

    print("selfcheck:", "FAIL" if failures else "OK")
    return 1 if failures else 0


if __name__ == "__main__":
    if "--selfcheck" in sys.argv:
        sys.exit(_selfcheck())
    mcp.run()
