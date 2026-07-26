"""Assembles narration audio + matched stock visuals + background music into
one rendered vertical (9:16) video using MoviePy.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from moviepy.editor import (
    AudioFileClip,
    CompositeAudioClip,
    CompositeVideoClip,
    VideoFileClip,
    afx,
    concatenate_videoclips,
)

from fetch_stock import fetch_stock_clip

logger = logging.getLogger(__name__)

TARGET_WIDTH = 1080
TARGET_HEIGHT = 1920
BG_MUSIC_VOLUME = 0.10


def _fit_clip_to_frame(clip: VideoFileClip, width: int, height: int) -> VideoFileClip:
    """Crop-to-fill a clip to the target aspect ratio (center crop), no letterboxing."""
    target_ratio = width / height
    clip_ratio = clip.w / clip.h

    if clip_ratio > target_ratio:
        # Clip is relatively wider than target: scale to target height, crop width.
        resized = clip.resize(height=height)
        excess = resized.w - width
        x1 = excess / 2
        cropped = resized.crop(x1=x1, x2=x1 + width)
    else:
        # Clip is relatively taller than target: scale to target width, crop height.
        resized = clip.resize(width=width)
        excess = resized.h - height
        y1 = excess / 2
        cropped = resized.crop(y1=y1, y2=y1 + height)

    return cropped


def _clip_for_segment(
    keyword: str,
    duration: float,
    pexels_api_key: str | None,
    pixabay_api_key: str | None,
) -> VideoFileClip:
    clip_path = fetch_stock_clip(keyword, pexels_api_key, pixabay_api_key)
    raw = VideoFileClip(str(clip_path))

    # Loop (via repeated concatenation) if the source clip is shorter than needed.
    if raw.duration < duration:
        loops_needed = int(duration // raw.duration) + 1
        raw = concatenate_videoclips([raw] * loops_needed)

    trimmed = raw.subclip(0, duration)
    return _fit_clip_to_frame(trimmed, TARGET_WIDTH, TARGET_HEIGHT).without_audio()


def assemble_video(
    manifest: list[dict[str, Any]],
    script: dict[str, Any],
    narration_audio_path: Path,
    output_path: Path,
    pexels_api_key: str | None = None,
    pixabay_api_key: str | None = None,
    music_path: Path | None = None,
    fps: int = 30,
) -> Path:
    """Build the final vertical video from the TTS manifest + script visual
    keywords + a background music track, and write output_path (mp4).
    """
    keyword_by_label = {"hook": script.get("hook_visual_keyword", "finance abstract")}
    for i, seg in enumerate(script["body_segments"]):
        keyword_by_label[f"body_{i}"] = seg["visual_keyword"]
    keyword_by_label["close"] = script.get("close_visual_keyword", "finance abstract")

    video_segments = []
    for entry in manifest:
        duration = entry["end_sec"] - entry["start_sec"]
        keyword = keyword_by_label.get(entry["label"], "personal finance")
        logger.info("Building visual for segment %s (%.1fs, keyword=%r)", entry["label"], duration, keyword)
        video_segments.append(
            _clip_for_segment(keyword, duration, pexels_api_key, pixabay_api_key)
        )

    video_track = concatenate_videoclips(video_segments, method="compose")
    narration = AudioFileClip(str(narration_audio_path))

    audio_tracks = [narration]
    if music_path and Path(music_path).exists():
        music = AudioFileClip(str(music_path)).fx(afx.audio_loop, duration=narration.duration)
        music = music.fx(afx.volumex, BG_MUSIC_VOLUME)
        audio_tracks.append(music)

    final_audio = CompositeAudioClip(audio_tracks) if len(audio_tracks) > 1 else narration
    final_video = CompositeVideoClip([video_track]).set_audio(final_audio).set_duration(narration.duration)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    final_video.write_videofile(
        str(output_path),
        fps=fps,
        codec="libx264",
        audio_codec="aac",
        threads=4,
        logger=None,
    )
    logger.info("Wrote assembled video to %s (%.1fs)", output_path, final_video.duration)
    return output_path
