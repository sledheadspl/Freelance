"""Automated pre-publish QC gate.

Any failed check routes the render to review/ instead of publish/, along
with a logged reason. Nothing reaches the auto-poster without passing all
checks here.
"""

from __future__ import annotations

import logging
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "publish"))
from posting_log import was_topic_angle_used_recently  # noqa: E402

logger = logging.getLogger(__name__)

MIN_DURATION_SEC = 45
MAX_DURATION_SEC = 90
MAX_SILENCE_GAP_SEC = 2.5
SILENCE_NOISE_THRESHOLD_DB = "-35dB"
CAPTION_COVERAGE_TOLERANCE_SEC = 3.0
DEDUPE_WINDOW_DAYS = 60


@dataclass
class QCResult:
    passed: bool
    reasons: list[str] = field(default_factory=list)

    def fail(self, reason: str) -> None:
        self.passed = False
        self.reasons.append(reason)


def _ffprobe_duration(path: Path) -> float:
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        raise RuntimeError(f"ffprobe failed to read duration for {path}: {proc.stderr}")
    return float(proc.stdout.strip())


def check_duration(video_path: Path, result: QCResult) -> float:
    duration = _ffprobe_duration(video_path)
    if not (MIN_DURATION_SEC <= duration <= MAX_DURATION_SEC):
        result.fail(
            f"Duration {duration:.1f}s outside target range "
            f"[{MIN_DURATION_SEC}, {MAX_DURATION_SEC}]s"
        )
    return duration


def check_silence(video_path: Path, result: QCResult) -> None:
    proc = subprocess.run(
        [
            "ffmpeg",
            "-i",
            str(video_path),
            "-af",
            f"silencedetect=noise={SILENCE_NOISE_THRESHOLD_DB}:d=0.5",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    silence_durations = [
        float(m) for m in re.findall(r"silence_duration:\s*([\d.]+)", proc.stderr)
    ]
    long_gaps = [d for d in silence_durations if d > MAX_SILENCE_GAP_SEC]
    if long_gaps:
        result.fail(
            f"Found {len(long_gaps)} silent gap(s) longer than {MAX_SILENCE_GAP_SEC}s "
            f"(longest {max(long_gaps):.1f}s) - likely a TTS rendering failure"
        )


def check_captions(ass_path: Path, video_duration: float, result: QCResult) -> None:
    if not ass_path.exists():
        result.fail(f"Captions file missing: {ass_path}")
        return

    text = ass_path.read_text()
    end_times = re.findall(r"Dialogue:\s*\d+,[\d:.]+,(\d+):(\d{2}):(\d{2}\.\d{2})", text)
    if not end_times:
        result.fail(f"Captions file {ass_path} has no dialogue lines")
        return

    last_h, last_m, last_s = end_times[-1]
    last_end_sec = int(last_h) * 3600 + int(last_m) * 60 + float(last_s)

    if last_end_sec < video_duration - CAPTION_COVERAGE_TOLERANCE_SEC:
        result.fail(
            f"Captions end at {last_end_sec:.1f}s but video is {video_duration:.1f}s "
            f"(gap > {CAPTION_COVERAGE_TOLERANCE_SEC}s) - captions don't cover full duration"
        )


def check_not_recently_used(topic: str, angle: str, result: QCResult) -> None:
    if was_topic_angle_used_recently(topic, angle, within_days=DEDUPE_WINDOW_DAYS):
        result.fail(
            f"Topic/angle combo ({topic!r}, {angle!r}) was already published "
            f"within the last {DEDUPE_WINDOW_DAYS} days"
        )


def run_quality_check(
    video_path: Path,
    ass_path: Path,
    topic: str,
    angle: str,
) -> QCResult:
    result = QCResult(passed=True)

    try:
        duration = check_duration(video_path, result)
    except RuntimeError as exc:
        result.fail(str(exc))
        duration = None

    check_silence(video_path, result)

    if duration is not None:
        check_captions(ass_path, duration, result)
    else:
        result.fail("Skipped caption coverage check: duration unknown")

    check_not_recently_used(topic, angle, result)

    if result.passed:
        logger.info("QC PASSED for %s", video_path)
    else:
        logger.warning("QC FAILED for %s: %s", video_path, "; ".join(result.reasons))

    return result


def route_failed_render(video_path: Path, review_dir: Path, result: QCResult) -> Path:
    """Moves a failed render (and its sibling caption/manifest files) into
    review/ and writes a reason log next to it.
    """
    review_dir.mkdir(parents=True, exist_ok=True)
    dest = review_dir / video_path.name
    shutil.move(str(video_path), str(dest))

    reason_log = dest.with_suffix(".qc_failure.txt")
    reason_log.write_text("\n".join(result.reasons) + "\n")

    logger.info("Routed failed render to %s (reasons logged in %s)", dest, reason_log)
    return dest
