import asyncio
import hashlib
from typing import Any

import httpx

DEFAULT_BASE = "https://api.libreview.io"

# These mimic the iOS LibreLinkUp app. Abbott periodically bumps the minimum
# accepted version; if requests start returning 401s with a healthy token,
# bump `version` to whatever the current LibreLinkUp iOS release reports.
HEADERS = {
    "product": "llu.ios",
    "version": "4.16.0",
    "accept": "application/json",
    "content-type": "application/json",
    "accept-encoding": "gzip",
    "cache-control": "no-cache",
    "connection": "keep-alive",
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
        async with httpx.AsyncClient(timeout=15) as client:
            for _ in range(3):
                r = await client.post(
                    f"{self.base_url}/llu/auth/login",
                    headers=HEADERS,
                    json={"email": self.email, "password": self.password},
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
                if not token or not user_id:
                    raise LibreLinkUpError(f"login failed: {payload}")
                self.token = token
                self.account_id_hash = hashlib.sha256(user_id.encode()).hexdigest()
                return
        raise LibreLinkUpError("too many region redirects")

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
                r.raise_for_status()
                return r.json()

    async def connections(self) -> list[dict]:
        payload = await self._request("GET", "/llu/connections")
        return payload.get("data") or []

    async def graph(self, patient_id: str) -> dict:
        payload = await self._request("GET", f"/llu/connections/{patient_id}/graph")
        return payload.get("data") or {}
