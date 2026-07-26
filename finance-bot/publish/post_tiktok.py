"""Publishes a rendered video to TikTok via the Content Posting API
(free, direct-post scope, quota-limited but sufficient at 1 post/day).

Uses the FILE_UPLOAD source: init the upload to get a signed upload URL,
then PUT the video bytes directly.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/"
STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/"


def post_tiktok_video(
    video_path: Path,
    title: str,
    access_token: str | None = None,
    privacy_level: str = "SELF_ONLY",
) -> str:
    """Uploads video_path to TikTok via direct post. Returns the publish_id.

    privacy_level defaults to SELF_ONLY (draft/private) since TikTok requires
    apps to pass audit review before PUBLIC_TO_EVERYONE is allowed for
    unaudited clients — flip this once your app is approved.
    """
    access_token = access_token or os.environ.get("TIKTOK_ACCESS_TOKEN")
    if not access_token:
        raise RuntimeError("TIKTOK_ACCESS_TOKEN not set")

    video_size = video_path.stat().st_size

    init_resp = requests.post(
        INIT_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
        json={
            "post_info": {
                "title": title[:150],
                "privacy_level": privacy_level,
                "disable_duet": False,
                "disable_comment": False,
                "disable_stitch": False,
            },
            "source_info": {
                "source": "FILE_UPLOAD",
                "video_size": video_size,
                "chunk_size": video_size,
                "total_chunk_count": 1,
            },
        },
        timeout=30,
    )
    init_resp.raise_for_status()
    init_data = init_resp.json()["data"]
    upload_url = init_data["upload_url"]
    publish_id = init_data["publish_id"]

    with open(video_path, "rb") as f:
        video_bytes = f.read()

    put_resp = requests.put(
        upload_url,
        headers={
            "Content-Type": "video/mp4",
            "Content-Range": f"bytes 0-{video_size - 1}/{video_size}",
        },
        data=video_bytes,
        timeout=120,
    )
    put_resp.raise_for_status()

    logger.info("Published TikTok video, publish_id=%s", publish_id)
    return publish_id


def check_tiktok_status(publish_id: str, access_token: str | None = None) -> dict:
    access_token = access_token or os.environ.get("TIKTOK_ACCESS_TOKEN")
    resp = requests.post(
        STATUS_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
        json={"publish_id": publish_id},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["data"]
