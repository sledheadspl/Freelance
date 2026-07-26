#!/usr/bin/env python3
"""Orchestrates one full end-to-end daily run:

  pick topic -> generate script -> TTS -> assemble video -> captions ->
  thumbnail -> QC gate -> publish (or route to review) -> update topic
  bank + posting log.

Runnable as a single command (see README.md for the cron entry):

    python pipeline.py

Every stage logs to stdout and to logs/pipeline_<date>.log so failures are
traceable to a specific stage.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import date
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).parent
for sub in ["scripts", "audio", "visuals", "captions", "thumbnails", "qc", "publish"]:
    sys.path.insert(0, str(ROOT / sub))

load_dotenv(ROOT / ".env")

from topic_selector import pick_next_topic  # noqa: E402
from generate_script import generate_script, ScriptGenerationError  # noqa: E402
from tts_render import render_script_audio  # noqa: E402
from assemble_video import assemble_video  # noqa: E402
from caption_burn import add_captions  # noqa: E402
from make_thumbnail import make_thumbnail, extract_frame_as_background  # noqa: E402
from quality_check import run_quality_check, route_failed_render  # noqa: E402
from posting_log import log_post  # noqa: E402
import post_youtube  # noqa: E402
import post_tiktok  # noqa: E402
import post_instagram  # noqa: E402


def setup_logging(logs_dir: Path) -> logging.Logger:
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_file = logs_dir / f"pipeline_{date.today().isoformat()}.log"

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[logging.FileHandler(log_file), logging.StreamHandler(sys.stdout)],
    )
    return logging.getLogger("pipeline")


def load_config(config_path: Path) -> dict:
    return yaml.safe_load(config_path.read_text())


class PipelineError(RuntimeError):
    """Raised with the stage name embedded so failures are traceable."""

    def __init__(self, stage: str, original: Exception):
        super().__init__(f"[stage={stage}] {original}")
        self.stage = stage
        self.original = original


def run(config: dict, logger: logging.Logger) -> Path:
    paths = config["paths"]
    output_dir = ROOT / paths["output_dir"]
    review_dir = ROOT / paths["review_dir"]
    topics_json = ROOT / paths["topics_json"]

    run_id = date.today().isoformat()
    run_dir = output_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    # 1. Pick topic
    logger.info("STAGE: pick_topic")
    try:
        topic_entry = pick_next_topic(topics_json)
    except Exception as exc:
        raise PipelineError("pick_topic", exc) from exc
    topic, bucket, angle = topic_entry["topic"], topic_entry["bucket"], topic_entry["angle"]
    logger.info("Selected topic=%r bucket=%r angle=%r", topic, bucket, angle)

    # 2. Generate script
    logger.info("STAGE: generate_script")
    try:
        script = generate_script(
            topic,
            bucket,
            angle,
            model=config["llm"]["model"],
            base_url=config["llm"]["base_url"],
            temperature=config["llm"]["temperature"],
            max_attempts=config["llm"]["max_attempts"],
        )
    except ScriptGenerationError as exc:
        raise PipelineError("generate_script", exc) from exc
    (run_dir / "script.json").write_text(json.dumps(script, indent=2))

    # 3. TTS render
    logger.info("STAGE: tts_render")
    narration_path = run_dir / "narration.wav"
    try:
        manifest = render_script_audio(
            script,
            narration_path,
            voice_model_path=str(ROOT / config["tts"]["voice_model_path"]),
            piper_binary=config["tts"]["piper_binary"],
            pause_ms=config["tts"]["pause_between_segments_ms"],
        )
    except Exception as exc:
        raise PipelineError("tts_render", exc) from exc
    (run_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    # 4. Assemble video
    logger.info("STAGE: assemble_video")
    raw_video_path = run_dir / "video_raw.mp4"
    music_path = ROOT / config["video"]["background_music_path"]
    try:
        assemble_video(
            manifest,
            script,
            narration_path,
            raw_video_path,
            pexels_api_key=os.environ.get(config["stock_footage"]["pexels_api_key_env"]),
            pixabay_api_key=os.environ.get(config["stock_footage"]["pixabay_api_key_env"]),
            music_path=music_path if music_path.exists() else None,
            fps=config["video"]["fps"],
        )
    except Exception as exc:
        raise PipelineError("assemble_video", exc) from exc

    # 5. Captions
    logger.info("STAGE: captions")
    captioned_video_path = run_dir / "video_captioned.mp4"
    try:
        _, words = add_captions(
            raw_video_path,
            captioned_video_path,
            whisper_model_size=config["captions"]["whisper_model_size"],
            words_per_caption=config["captions"]["words_per_caption"],
        )
    except Exception as exc:
        raise PipelineError("captions", exc) from exc
    ass_path = raw_video_path.with_suffix(".ass")

    # 6. Thumbnail
    logger.info("STAGE: thumbnail")
    thumbnail_path = run_dir / "thumbnail.jpg"
    try:
        frame_path = run_dir / "thumb_frame.jpg"
        extract_frame_as_background(captioned_video_path, frame_path)
        make_thumbnail(script["hook"], thumbnail_path, background_path=frame_path)
    except Exception as exc:
        raise PipelineError("thumbnail", exc) from exc

    # 7. QC gate
    logger.info("STAGE: quality_check")
    try:
        qc_result = run_quality_check(captioned_video_path, ass_path, topic, angle)
    except Exception as exc:
        raise PipelineError("quality_check", exc) from exc

    if not qc_result.passed:
        dest = route_failed_render(captioned_video_path, review_dir / run_id, qc_result)
        logger.warning("Run routed to review: %s (reasons: %s)", dest, qc_result.reasons)
        for platform in ("youtube", "tiktok", "instagram"):
            log_post(topic, bucket, angle, platform, status="qc_failed", detail="; ".join(qc_result.reasons))
        return dest

    # 8. Publish
    logger.info("STAGE: publish")
    publish_cfg = config["publishing"]
    if publish_cfg.get("enabled", True):
        _publish_all(publish_cfg, captioned_video_path, script, topic, bucket, angle, logger)
    else:
        logger.info("Publishing disabled in config; leaving finished video in %s", captioned_video_path)

    logger.info("Pipeline run complete for topic=%r -> %s", topic, captioned_video_path)
    return captioned_video_path


def _publish_all(publish_cfg: dict, video_path: Path, script: dict, topic: str, bucket: str, angle: str, logger: logging.Logger) -> None:
    title = script["hook"][:90]
    description = script["close"]

    yt_cfg = publish_cfg["platforms"]["youtube"]
    if yt_cfg.get("enabled"):
        try:
            video_id = post_youtube.post_youtube_short(
                video_path,
                title,
                description,
                tags=["personalfinance", "moneytips", "finance"],
                client_secret_path=str(ROOT / yt_cfg["client_secret_path"]),
                token_path=str(ROOT / yt_cfg["token_path"]),
                privacy_status=yt_cfg["privacy_status"],
            )
            log_post(topic, bucket, angle, "youtube", status="published", post_id=video_id)
        except Exception as exc:
            logger.exception("YouTube publish failed")
            log_post(topic, bucket, angle, "youtube", status="failed", detail=str(exc))

    tt_cfg = publish_cfg["platforms"]["tiktok"]
    if tt_cfg.get("enabled"):
        try:
            publish_id = post_tiktok.post_tiktok_video(
                video_path,
                title,
                access_token=os.environ.get(tt_cfg["access_token_env"]),
                privacy_level=tt_cfg["privacy_level"],
            )
            log_post(topic, bucket, angle, "tiktok", status="published", post_id=publish_id)
        except Exception as exc:
            logger.exception("TikTok publish failed")
            log_post(topic, bucket, angle, "tiktok", status="failed", detail=str(exc))

    ig_cfg = publish_cfg["platforms"]["instagram"]
    if ig_cfg.get("enabled"):
        try:
            base_url = ig_cfg.get("public_video_url_base", "")
            if not base_url:
                raise RuntimeError("public_video_url_base not configured; Instagram needs a public video URL")
            video_url = f"{base_url.rstrip('/')}/{video_path.name}"
            media_id = post_instagram.post_instagram_reel(
                video_url,
                caption=description,
                ig_user_id=os.environ.get(ig_cfg["ig_user_id_env"]),
                access_token=os.environ.get(ig_cfg["access_token_env"]),
            )
            log_post(topic, bucket, angle, "instagram", status="published", post_id=media_id)
        except Exception as exc:
            logger.exception("Instagram publish failed")
            log_post(topic, bucket, angle, "instagram", status="failed", detail=str(exc))


def main() -> None:
    config = load_config(ROOT / "config.yaml")
    logger = setup_logging(ROOT / config["paths"]["logs_dir"])
    logger.info("=== finance-bot pipeline run starting: %s ===", date.today().isoformat())
    try:
        result_path = run(config, logger)
        logger.info("=== Run finished OK: %s ===", result_path)
    except PipelineError as exc:
        logger.error("=== Run FAILED at stage %r: %s ===", exc.stage, exc.original)
        sys.exit(1)


if __name__ == "__main__":
    main()
