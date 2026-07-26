"""Generates a vertical thumbnail: a background frame (or template image) with
the hook line rendered as bold overlay text, via Pillow.
"""

from __future__ import annotations

import logging
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

THUMB_WIDTH = 1080
THUMB_HEIGHT = 1920
DEFAULT_FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
OVERLAY_OPACITY = 140  # 0-255, darkens the lower portion so text stays readable


def _load_background(background_path: Path | None) -> Image.Image:
    if background_path and Path(background_path).exists():
        img = Image.open(background_path).convert("RGB")
    else:
        img = Image.new("RGB", (THUMB_WIDTH, THUMB_HEIGHT), color=(15, 23, 42))
    img = img.resize((THUMB_WIDTH, THUMB_HEIGHT))
    return img


def _add_bottom_gradient(img: Image.Image) -> Image.Image:
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    gradient_start = int(THUMB_HEIGHT * 0.45)
    for y in range(gradient_start, THUMB_HEIGHT):
        alpha = int(OVERLAY_OPACITY * (y - gradient_start) / (THUMB_HEIGHT - gradient_start))
        draw.line([(0, y), (THUMB_WIDTH, y)], fill=(0, 0, 0, alpha))
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def _draw_hook_text(img: Image.Image, hook_text: str, font_path: str) -> Image.Image:
    draw = ImageDraw.Draw(img)
    font_size = 88
    font = ImageFont.truetype(font_path, font_size)

    wrapped = textwrap.fill(hook_text.upper(), width=16)
    lines = wrapped.split("\n")

    # Shrink font until the text block fits within the width/height budget.
    while True:
        line_heights = [draw.textbbox((0, 0), line, font=font)[3] for line in lines]
        block_height = sum(line_heights) + (len(lines) - 1) * 12
        max_line_width = max(draw.textbbox((0, 0), line, font=font)[2] for line in lines)
        if (block_height < THUMB_HEIGHT * 0.35 and max_line_width < THUMB_WIDTH * 0.9) or font_size <= 40:
            break
        font_size -= 6
        font = ImageFont.truetype(font_path, font_size)

    y = THUMB_HEIGHT - block_height - 140
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        line_width = bbox[2] - bbox[0]
        x = (THUMB_WIDTH - line_width) / 2
        # Simple stroke outline for legibility over varied backgrounds.
        draw.text((x, y), line, font=font, fill=(255, 255, 255), stroke_width=4, stroke_fill=(0, 0, 0))
        y += (bbox[3] - bbox[1]) + 12

    return img


def make_thumbnail(
    hook_text: str,
    output_path: Path,
    background_path: Path | None = None,
    font_path: str = DEFAULT_FONT_PATH,
) -> Path:
    img = _load_background(background_path)
    img = _add_bottom_gradient(img)
    img = _draw_hook_text(img, hook_text, font_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, quality=92)
    logger.info("Wrote thumbnail -> %s", output_path)
    return output_path


def extract_frame_as_background(video_path: Path, out_path: Path, t: float = 1.0) -> Path:
    """Pulls a single frame from the rendered video to use as the thumbnail
    background, so the thumbnail visually matches the video.
    """
    from moviepy.editor import VideoFileClip

    with VideoFileClip(str(video_path)) as clip:
        frame_time = min(t, max(clip.duration - 0.1, 0))
        clip.save_frame(str(out_path), t=frame_time)
    return out_path


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Generate a thumbnail from a hook line")
    parser.add_argument("--hook", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--background", default=None)
    args = parser.parse_args()
    make_thumbnail(args.hook, Path(args.out), Path(args.background) if args.background else None)
