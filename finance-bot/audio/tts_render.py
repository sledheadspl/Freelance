"""Renders a script's narration to a single audio track using Piper (local TTS).

Piper runs fully offline once a voice model (.onnx + .onnx.json) is downloaded
(see README.md). No paid API involved.

Produces:
  - a concatenated audio file (wav)
  - a segment-timing manifest (list of {index, label, text, start_sec, end_sec})
    used later to sync captions/visuals to narration.
"""

from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from pydub import AudioSegment

logger = logging.getLogger(__name__)

PAUSE_BETWEEN_SEGMENTS_MS = 350


def _render_segment_with_piper(
    text: str, voice_model_path: str, piper_binary: str, out_wav: Path
) -> None:
    proc = subprocess.run(
        [
            piper_binary,
            "--model",
            voice_model_path,
            "--output_file",
            str(out_wav),
        ],
        input=text.encode("utf-8"),
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0 or not out_wav.exists():
        raise RuntimeError(
            f"Piper TTS failed for segment (rc={proc.returncode}): "
            f"{proc.stderr.decode('utf-8', errors='replace')}"
        )


def render_script_audio(
    script: dict[str, Any],
    output_wav_path: Path,
    voice_model_path: str,
    piper_binary: str = "piper",
    pause_ms: int = PAUSE_BETWEEN_SEGMENTS_MS,
) -> list[dict]:
    """Render hook + each body segment + close through Piper TTS, concatenate
    with short pauses, and write output_wav_path.

    Returns a segment-timing manifest: list of dicts with index, label,
    text, start_sec, end_sec (relative to the final concatenated track).
    """
    labeled_texts = [("hook", script["hook"])]
    for i, seg in enumerate(script["body_segments"]):
        labeled_texts.append((f"body_{i}", seg["narration"]))
    labeled_texts.append(("close", script["close"]))

    manifest: list[dict] = []
    combined = AudioSegment.empty()
    pause = AudioSegment.silent(duration=pause_ms)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        for i, (label, text) in enumerate(labeled_texts):
            seg_wav = tmp_path / f"{i:02d}_{label}.wav"
            logger.info("Rendering TTS segment %s: %r", label, text[:60])
            _render_segment_with_piper(text, voice_model_path, piper_binary, seg_wav)

            audio = AudioSegment.from_wav(seg_wav)
            start_sec = len(combined) / 1000.0
            combined += audio
            end_sec = len(combined) / 1000.0

            manifest.append(
                {
                    "index": i,
                    "label": label,
                    "text": text,
                    "start_sec": round(start_sec, 3),
                    "end_sec": round(end_sec, 3),
                }
            )

            if i < len(labeled_texts) - 1:
                combined += pause

    output_wav_path.parent.mkdir(parents=True, exist_ok=True)
    combined.export(output_wav_path, format="wav")
    logger.info(
        "Rendered %d segments, total duration %.1fs -> %s",
        len(manifest),
        len(combined) / 1000.0,
        output_wav_path,
    )
    return manifest


if __name__ == "__main__":
    import argparse
    import json

    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Render a script JSON file to narration audio")
    parser.add_argument("--script", required=True, help="Path to script JSON")
    parser.add_argument("--voice-model", required=True, help="Path to Piper .onnx voice model")
    parser.add_argument("--out", required=True, help="Output wav path")
    parser.add_argument("--piper-binary", default="piper")
    args = parser.parse_args()

    script_data = json.loads(Path(args.script).read_text())
    result_manifest = render_script_audio(
        script_data, Path(args.out), args.voice_model, args.piper_binary
    )
    manifest_path = Path(args.out).with_suffix(".manifest.json")
    manifest_path.write_text(json.dumps(result_manifest, indent=2))
    print(f"Wrote {args.out} and {manifest_path}")
