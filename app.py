import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.staticfiles import StaticFiles

# --- Optional glucose bridge -------------------------------------------------
# Beam started life as a FreeStyle Libre 2 -> cloud bridge. The food tracker
# PWA works completely standalone; the glucose endpoints only switch on if you
# provide Libre credentials. No creds => the app still boots, the glucose panel
# just stays dormant.
EMAIL = os.environ.get("LLU_EMAIL")
PASSWORD = os.environ.get("LLU_PASSWORD")
API_TOKEN = os.environ.get("API_TOKEN")
PATIENT_ID = os.environ.get("LLU_PATIENT_ID")
GLUCOSE_ENABLED = bool(EMAIL and PASSWORD and API_TOKEN)

STATIC_DIR = Path(__file__).parent / "static"

TREND = {
    1: "falling quickly",
    2: "falling",
    3: "stable",
    4: "rising",
    5: "rising quickly",
}

# Icons are generated, not committed (keeps the repo free of binaries). On Fly
# they're baked in at Docker build time. For local `uvicorn` runs we generate
# them lazily in a background thread so they appear without blocking startup
# (pure-Python supersampling takes a few seconds).
def _ensure_icons() -> None:
    if (STATIC_DIR / "icons" / "icon-512.png").exists():
        return
    try:
        import sys

        sys.path.insert(0, str(Path(__file__).parent / "scripts"))
        import make_icons

        make_icons.main()
    except Exception as exc:  # never let icon generation affect the app
        print(f"icon generation skipped: {exc}")


import threading

threading.Thread(target=_ensure_icons, daemon=True).start()

app = FastAPI(title="Beam", description="Keto food tracker + Libre glucose bridge")

client = None
if GLUCOSE_ENABLED:
    from librelinkup import LibreLinkUp

    client = LibreLinkUp(EMAIL, PASSWORD)


def require_token(authorization: str | None) -> None:
    if not GLUCOSE_ENABLED:
        raise HTTPException(status_code=503, detail="glucose bridge not configured")
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
    return {"ok": True, "glucose_enabled": GLUCOSE_ENABLED}


@app.get("/config")
async def config():
    """Public, non-secret runtime info the PWA reads on load."""
    return {"glucose_enabled": GLUCOSE_ENABLED}


# --- PWA static hosting ------------------------------------------------------
# Mounted last so the API routes above take precedence. html=True serves
# index.html at "/" and lets the service worker / manifest resolve.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
