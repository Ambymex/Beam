import asyncio
import base64
import hashlib
from typing import Any

import httpx

DEFAULT_BASE = "https://api.libreview.io"

# These mimic the iOS LibreLinkUp app. Abbott periodically bumps the minimum
# accepted version; if requests start returning 401s with a healthy token,
# bump `version` to whatever the current LibreLinkUp iOS release reports.
#
# The user-agent matters as much as the version (learned 2026-07-22): httpx's
# default `python-httpx/x.y` UA started getting rejected by Abbott's gateway
# with a garbled canned error ("decode base64 password: illegal base64 data")
# that looks like a contract change but is really bot-filtering. This UA and
# header set match nightscout-librelink-up, which thousands of people run
# daily — track theirs if Abbott moves again.
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU OS 17_4.1 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/17.4.1 Mobile/10A5355d Safari/8536.25",
    "product": "llu.ios",
    "version": "4.16.0",
    "accept": "application/json",
    "content-type": "application/json;charset=UTF-8",
    "cache-control": "no-cache",
    "connection": "keep-alive",
    "account-id": "",
}


class LibreLinkUpError(Exception):
    pass


class LibreLinkUp:
    def __init__(self, email: str, password: str):
        self.email = email
        self.password = password
        self.base_url = DEFAULT_BASE
        self.token: str | None = None
        self.account_id_hash: str | None = None
        self._lock = asyncio.Lock()

    async def _login(self) -> None:
        # Abbott changed the login contract (observed 2026-07-22): the server
        # now base64-DECODES the password field, so plaintext fails with
        # "decode base64 password: illegal base64 data at input byte 0".
        # Send it encoded first; keep one plaintext attempt as a fallback in
        # case a regional server still speaks the old contract.
        # Plaintext FIRST: it's the contract the official app and
        # nightscout-librelink-up use today. The base64 variant is a
        # last-resort fallback only — leading with a wrong-looking password
        # on every login risks Abbott's account lockout (their 429 "locked").
        candidates = [
            ("plain", self.password),
            ("b64", base64.b64encode(self.password.encode()).decode()),
        ]
        errors: list[str] = []
        async with httpx.AsyncClient(timeout=15) as client:
            for tag, candidate in candidates:
                self.base_url = DEFAULT_BASE  # restart the region walk per attempt
                for _ in range(3):
                    r = await client.post(
                        f"{self.base_url}/llu/auth/login",
                        headers=HEADERS,
                        json={"email": self.email, "password": candidate},
                    )
                    r.raise_for_status()
                    payload = r.json()
                    data = payload.get("data") or {}
                    if data.get("redirect"):
                        self.base_url = f"https://api-{data['region']}.libreview.io"
                        continue
                    ticket = data.get("authTicket") or {}
                    user_id = (data.get("user") or {}).get("id")
                    token = ticket.get("token")
                    if token and user_id:
                        self.token = token
                        self.account_id_hash = hashlib.sha256(user_id.encode()).hexdigest()
                        return
                    # keep every attempt's rejection visible — the first
                    # attempt's error is the diagnostic one, and a fallback
                    # overwriting it cost us a debugging round once
                    errors.append(f"{tag}: {payload}")
                    break  # this encoding was rejected — try the next one
                else:
                    errors.append(f"{tag}: too many region redirects")
        raise LibreLinkUpError(f"login failed: {' | '.join(errors)}")

    async def _request(self, method: str, path: str) -> Any:
        async with self._lock:
            if not self.token:
                await self._login()
        async with httpx.AsyncClient(timeout=15) as client:
            for attempt in range(2):
                headers = {
                    **HEADERS,
                    "authorization": f"Bearer {self.token}",
                    "account-id": self.account_id_hash,
                }
                r = await client.request(method, f"{self.base_url}{path}", headers=headers)
                if r.status_code == 401 and attempt == 0:
                    async with self._lock:
                        await self._login()
                    continue
                if r.status_code >= 400:
                    # Surface Abbott's response body — a bare status code hides
                    # the difference between version-gating, bot-blocking, and
                    # a revoked follower.
                    raise LibreLinkUpError(
                        f"LibreLinkUp {r.status_code} on {path}: {r.text[:300]}"
                    )
                return r.json()

    async def connections(self) -> list[dict]:
        payload = await self._request("GET", "/llu/connections")
        return payload.get("data") or []

    async def graph(self, patient_id: str) -> dict:
        payload = await self._request("GET", f"/llu/connections/{patient_id}/graph")
        return payload.get("data") or {}
