"""Publishes a rendered video as an Instagram Reel via the Instagram Graph API
(free-tier, quota-limited but sufficient at 1 post/day).

The Graph API requires a publicly reachable video_url it can fetch from
(it does not accept raw file uploads), so video_path must already be hosted
somewhere reachable by Meta's servers before calling this (e.g. a short-lived
signed URL from your own storage/CDN). See README.md for options.
"""

from __future__ import annotations

import logging
import os
import time

import requests

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.facebook.com/v19.0"
POLL_INTERVAL_SEC = 5
POLL_TIMEOUT_SEC = 300


def post_instagram_reel(
    video_url: str,
    caption: str,
    ig_user_id: str | None = None,
    access_token: str | None = None,
) -> str:
    """Creates and publishes an Instagram Reel from a publicly reachable
    video_url. Returns the published media ID.
    """
    ig_user_id = ig_user_id or os.environ.get("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    access_token = access_token or os.environ.get("INSTAGRAM_ACCESS_TOKEN")
    if not ig_user_id or not access_token:
        raise RuntimeError("INSTAGRAM_BUSINESS_ACCOUNT_ID / INSTAGRAM_ACCESS_TOKEN not set")

    create_resp = requests.post(
        f"{GRAPH_API_BASE}/{ig_user_id}/media",
        data={
            "media_type": "REELS",
            "video_url": video_url,
            "caption": caption,
            "access_token": access_token,
        },
        timeout=30,
    )
    create_resp.raise_for_status()
    creation_id = create_resp.json()["id"]

    _wait_for_container_ready(creation_id, access_token)

    publish_resp = requests.post(
        f"{GRAPH_API_BASE}/{ig_user_id}/media_publish",
        data={"creation_id": creation_id, "access_token": access_token},
        timeout=30,
    )
    publish_resp.raise_for_status()
    media_id = publish_resp.json()["id"]
    logger.info("Published Instagram Reel, media_id=%s", media_id)
    return media_id


def _wait_for_container_ready(creation_id: str, access_token: str) -> None:
    """Instagram processes the uploaded video asynchronously; poll status
    until FINISHED before calling media_publish.
    """
    deadline = time.monotonic() + POLL_TIMEOUT_SEC
    while time.monotonic() < deadline:
        status_resp = requests.get(
            f"{GRAPH_API_BASE}/{creation_id}",
            params={"fields": "status_code", "access_token": access_token},
            timeout=30,
        )
        status_resp.raise_for_status()
        status_code = status_resp.json().get("status_code")
        logger.info("Instagram media container status: %s", status_code)
        if status_code == "FINISHED":
            return
        if status_code == "ERROR":
            raise RuntimeError(f"Instagram media container {creation_id} failed processing")
        time.sleep(POLL_INTERVAL_SEC)

    raise TimeoutError(f"Instagram media container {creation_id} did not finish processing in time")
