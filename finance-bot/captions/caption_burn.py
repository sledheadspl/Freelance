"""Generates word-synced captions from the rendered video's audio using
faster-whisper (local, no API), then burns them into the video via ffmpeg.
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

DEFAULT_ASS_STYLE = (
    "Fontname=Arial,Fontsize=16,PrimaryColour=&H00FFFFFF,"
    "OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,"
    "Alignment=2,MarginV=180,Bold=1"
)


def transcribe_words(audio_path: Path, model_size: str = "base", device: str = "cpu", compute_type: str = "int8") -> list[dict]:
    """Run faster-whisper and return a flat list of {word, start, end}."""
    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    segments, _info = model.transcribe(str(audio_path), word_timestamps=True)

    words: list[dict] = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"word": w.word.strip(), "start": w.start, "end": w.end})
    logger.info("Transcribed %d words from %s", len(words), audio_path)
    return words


def _format_ass_time(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:d}:{minutes:02d}:{secs:05.2f}"


def words_to_ass(words: list[dict], ass_path: Path, words_per_caption: int = 3) -> Path:
    """Group words into short caption chunks and write an .ass subtitle file
    styled for mobile-readable burned-in captions.
    """
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,64,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,6,0,2,60,60,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for i in range(0, len(words), words_per_caption):
        chunk = words[i : i + words_per_caption]
        if not chunk:
            continue
        start = chunk[0]["start"]
        end = chunk[-1]["end"]
        text = " ".join(w["word"] for w in chunk).upper()
        lines.append(
            f"Dialogue: 0,{_format_ass_time(start)},{_format_ass_time(end)},Default,,0,0,0,,{text}\n"
        )

    ass_path.parent.mkdir(parents=True, exist_ok=True)
    ass_path.write_text("".join(lines))
    return ass_path


def burn_captions(video_path: Path, ass_path: Path, output_path: Path) -> Path:
    """Burn the .ass subtitle file into the video via ffmpeg."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vf",
        f"ass={ass_path}",
        "-c:a",
        "copy",
        str(output_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg caption burn-in failed: {proc.stderr}")
    logger.info("Burned captions -> %s", output_path)
    return output_path


def add_captions(
    video_path: Path,
    output_path: Path,
    whisper_model_size: str = "base",
    words_per_caption: int = 3,
) -> tuple[Path, list[dict]]:
    """End-to-end: transcribe video's audio, build .ass captions, burn in.

    Returns (output_video_path, word_list) so callers/QC can check caption
    coverage against the audio duration.
    """
    words = transcribe_words(video_path, model_size=whisper_model_size)
    if not words:
        raise RuntimeError(f"faster-whisper produced no words for {video_path}; TTS/audio likely failed")

    ass_path = video_path.with_suffix(".ass")
    words_to_ass(words, ass_path, words_per_caption=words_per_caption)
    burn_captions(video_path, ass_path, output_path)
    return output_path, words
