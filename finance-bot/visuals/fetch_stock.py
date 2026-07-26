"""Fetches stock footage clips per segment visual_keyword from free-tier APIs.

Uses Pexels (primary) and Pixabay (fallback) — both free at this volume
(a handful of downloads/day). Downloads are cached locally by keyword so a
repeated keyword across runs doesn't re-download.
"""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent.parent / "stock_cache"
PEXELS_API_URL = "https://api.pexels.com/videos/search"
PIXABAY_API_URL = "https://pixabay.com/api/videos/"


class StockFetchError(RuntimeError):
    """Raised when no stock clip could be found/downloaded for a keyword."""


def _cache_path(keyword: str) -> Path:
    slug = hashlib.sha1(keyword.strip().lower().encode("utf-8")).hexdigest()[:16]
    safe_name = "".join(c if c.isalnum() else "_" for c in keyword.strip().lower())[:40]
    return CACHE_DIR / f"{safe_name}_{slug}.mp4"


def _download(url: str, dest: Path) -> None:
    with requests.get(url, stream=True, timeout=60) as resp:
        resp.raise_for_status()
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 16):
                f.write(chunk)


def _try_pexels(keyword: str, api_key: str, orientation: str = "portrait") -> str | None:
    resp = requests.get(
        PEXELS_API_URL,
        headers={"Authorization": api_key},
        params={"query": keyword, "orientation": orientation, "per_page": 5},
        timeout=30,
    )
    if resp.status_code != 200:
        logger.warning("Pexels search failed for %r: %s", keyword, resp.status_code)
        return None
    videos = resp.json().get("videos", [])
    if not videos:
        return None
    # Pick the smallest file that's still reasonably sized (faster to fetch/process).
    files = sorted(videos[0]["video_files"], key=lambda f: f.get("width", 0))
    for f in files:
        if f.get("width", 0) >= 720:
            return f["link"]
    return files[-1]["link"] if files else None


def _try_pixabay(keyword: str, api_key: str) -> str | None:
    resp = requests.get(
        PIXABAY_API_URL,
        params={"key": api_key, "q": keyword, "per_page": 5},
        timeout=30,
    )
    if resp.status_code != 200:
        logger.warning("Pixabay search failed for %r: %s", keyword, resp.status_code)
        return None
    hits = resp.json().get("hits", [])
    if not hits:
        return None
    videos = hits[0]["videos"]
    return (videos.get("medium") or videos.get("small") or videos.get("large") or {}).get("url")


def fetch_stock_clip(
    keyword: str,
    pexels_api_key: str | None = None,
    pixabay_api_key: str | None = None,
    cache_dir: Path = CACHE_DIR,
) -> Path:
    """Return a local path to a stock clip matching keyword, downloading and
    caching it if not already cached. Tries Pexels first, then Pixabay.
    """
    cache_path = _cache_path(keyword)
    if cache_path.exists():
        logger.info("Using cached stock clip for %r -> %s", keyword, cache_path)
        return cache_path

    pexels_api_key = pexels_api_key or os.environ.get("PEXELS_API_KEY")
    pixabay_api_key = pixabay_api_key or os.environ.get("PIXABAY_API_KEY")

    url = None
    if pexels_api_key:
        url = _try_pexels(keyword, pexels_api_key)
    if not url and pixabay_api_key:
        url = _try_pixabay(keyword, pixabay_api_key)

    if not url:
        raise StockFetchError(f"No stock footage found for keyword {keyword!r} on any provider")

    logger.info("Downloading stock clip for %r from %s", keyword, url)
    _download(url, cache_path)
    return cache_path


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Fetch/cache a stock clip for a keyword")
    parser.add_argument("keyword")
    args = parser.parse_args()
    path = fetch_stock_clip(args.keyword)
    print(path)
