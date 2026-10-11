"""Optional, user-requested related reading. Never manufacture citations for a mission."""
from datetime import datetime, timezone
from urllib.parse import urlsplit

import httpx


def safe_url(value):
    if not isinstance(value, str) or len(value) > 2048 or any(ord(c) < 33 for c in value) or "\\" in value:
        return None
    try:
        url = urlsplit(value)
        if url.scheme in ("http", "https") and url.hostname and not url.username and not url.password:
            return value
    except ValueError:
        pass
    return None


def result(status, sources=None):
    return {"status": status, "provider": "tavily", "sources": sources or [],
            "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}


async def search(goal: str, api_key: str):
    if not api_key.strip():
        return result("not_configured")
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"query": goal[:400], "search_depth": "basic", "max_results": 3,
                      "include_answer": False, "include_raw_content": False, "include_images": False},
            )
        response.raise_for_status()
        payload = response.json()
        rows = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            return result("unavailable")
        sources = []
        seen = set()
        for row in rows:
            if not isinstance(row, dict):
                continue
            url = safe_url(row.get("url"))
            title = row.get("title")
            if not url or url in seen or not isinstance(title, str) or not title.strip():
                continue
            sources.append({"title": title.strip()[:240], "url": url})
            seen.add(url)
            if len(sources) == 3:
                break
        return result("ready" if sources else "empty", sources)
    except (httpx.HTTPError, TimeoutError, ValueError):
        # No upstream body, credentials, or invented replacement URLs reach the client.
        return result("unavailable")
