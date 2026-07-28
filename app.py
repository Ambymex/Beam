import os
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from librelinkup import LibreLinkUp, LibreLinkUpError

DEFAULT_UPSTREAM = "https://api.libreview.io"

EMAIL = os.environ["LLU_EMAIL"]
PASSWORD = os.environ["LLU_PASSWORD"]
API_TOKEN = os.environ["API_TOKEN"]
PATIENT_ID = os.environ.get("LLU_PATIENT_ID")

TREND = {
    1: "falling quickly",
    2: "falling",
    3: "stable",
    4: "rising",
    5: "rising quickly",
}

app = FastAPI(title="Beam", description="Libre 2 to Gemini bridge")

# The radial planner PWA reads glucose straight from the browser; the bearer
# token (not the origin) is the actual gate, so a wildcard origin is fine here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["Authorization"],
)

client = LibreLinkUp(EMAIL, PASSWORD)


# Upstream (Abbott) failures must come back as JSON 502s, not naked 500s:
# unhandled exceptions skip the CORS middleware, and a CORS-less error is
# masked by browsers as a generic "Load failed" — undebuggable from the client.
@app.exception_handler(LibreLinkUpError)
async def librelinkup_error(request: Request, exc: LibreLinkUpError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(httpx.HTTPError)
async def upstream_http_error(request: Request, exc: httpx.HTTPError):
    return JSONResponse(status_code=502, content={"detail": f"upstream error: {exc}"})


def require_token(authorization: str | None) -> None:
    if authorization != f"Bearer {API_TOKEN}":
        raise HTTPException(status_code=401, detail="invalid token")


async def pick_connection() -> dict:
    conns = await client.connections()
    if not conns:
        raise HTTPException(status_code=404, detail="no LibreLinkUp connections found")
    if PATIENT_ID:
        for c in conns:
            if c.get("patientId") == PATIENT_ID:
                return c
        raise HTTPException(status_code=404, detail=f"patientId {PATIENT_ID} not found")
    return conns[0]


def parse_factory_ts(s: str) -> datetime:
    return datetime.strptime(s, "%m/%d/%Y %I:%M:%S %p").replace(tzinfo=timezone.utc)


def shape_measurement(m: dict, include_trend: bool = True) -> dict:
    ts = parse_factory_ts(m["FactoryTimestamp"])
    out = {
        "mg_per_dl": m["ValueInMgPerDl"],
        "mmol_per_l": round(m["ValueInMgPerDl"] / 18.0182, 1),
        "timestamp_utc": ts.isoformat(),
    }
    if include_trend:
        out["trend"] = TREND.get(m.get("TrendArrow"), "unknown")
        out["minutes_old"] = int((datetime.now(timezone.utc) - ts).total_seconds() // 60)
        out["is_high"] = bool(m.get("isHigh"))
        out["is_low"] = bool(m.get("isLow"))
    return out


@app.get("/glucose/current")
async def current(authorization: str | None = Header(default=None)):
    require_token(authorization)
    conn = await pick_connection()
    measurement = conn.get("glucoseMeasurement")
    if not measurement:
        raise HTTPException(status_code=503, detail="no current measurement available")
    return shape_measurement(measurement)


@app.get("/glucose/history")
async def history(
    minutes: int = Query(180, ge=15, le=720),
    authorization: str | None = Header(default=None),
):
    require_token(authorization)
    conn = await pick_connection()
    data = await client.graph(conn["patientId"])
    points = data.get("graphData") or []
    now = datetime.now(timezone.utc)
    formatted = [
        shape_measurement(p, include_trend=False)
        for p in points
        if (now - parse_factory_ts(p["FactoryTimestamp"])).total_seconds() / 60 <= minutes
    ]
    return {"points": formatted, "count": len(formatted), "window_minutes": minutes}


@app.get("/healthz")
async def healthz():
    return {"ok": True}


@app.get("/healthz/upstream")
async def healthz_upstream():
    """Can THIS machine talk to Abbott's login API at all?

    Posts deliberately-fake credentials (never the real ones — a fake email
    can't lock the real account) and classifies the response. A healthy
    vantage point gets a clean "incorrect username/password"; a gateway that
    is bot-blocking this IP/ASN returns garbage like "decode base64
    password". Tokenless on purpose: it reveals nothing but Abbott's opinion
    of this machine, and it exists precisely for debugging days when the
    real login is broken (2026-07-22: cloud-IP filtering took the bridge
    down while the same request worked from a residential IP).
    """
    from librelinkup import HEADERS

    async with httpx.AsyncClient(timeout=15) as probe:
        try:
            r = await probe.post(
                f"{DEFAULT_UPSTREAM}/llu/auth/login",
                headers=HEADERS,
                json={"email": "probe-diagnostic@example.com", "password": "NotARealPassword1"},
            )
            body = r.text[:300]
            healthy = '"status":2' in body.replace(" ", "") and "incorrect" in body
            return {
                "upstream_reachable": True,
                "http_status": r.status_code,
                "looks_healthy": healthy,
                "body_snippet": body,
            }
        except Exception as e:  # noqa: BLE001 — diagnostics report, never raise
            return {"upstream_reachable": False, "error": str(e)[:300]}
