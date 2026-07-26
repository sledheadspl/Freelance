"""Selects the next topic to produce a video for and marks it used.

Selection rule: oldest unused entry first (stable JSON order acts as the
"oldest" tiebreak since entries are never reordered), skipping the most
recently used bucket so the same bucket doesn't run two days in a row.
"""

from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path

logger = logging.getLogger(__name__)

TOPICS_PATH = Path(__file__).parent.parent / "topics" / "topics.json"


def _load_topics(topics_path: Path) -> list[dict]:
    return json.loads(topics_path.read_text())


def _save_topics(topics_path: Path, topics: list[dict]) -> None:
    topics_path.write_text(json.dumps(topics, indent=2) + "\n")


def _last_used_bucket(topics: list[dict]) -> str | None:
    used = [t for t in topics if t["used_date"]]
    if not used:
        return None
    most_recent = max(used, key=lambda t: t["used_date"])
    return most_recent["bucket"]


def pick_next_topic(topics_path: Path = TOPICS_PATH, mark_used: bool = True) -> dict:
    """Return the next topic dict to use, marking it used_date=today unless
    mark_used=False (useful for dry runs/tests).

    Raises RuntimeError if the topic bank is exhausted.
    """
    topics = _load_topics(topics_path)
    unused = [t for t in topics if not t["used_date"]]
    if not unused:
        raise RuntimeError(
            "Topic bank exhausted: every entry in topics.json has a used_date. "
            "Refill the bank (e.g., add more entries or reset stale ones)."
        )

    avoid_bucket = _last_used_bucket(topics)

    candidates = [t for t in unused if t["bucket"] != avoid_bucket]
    if not candidates:
        # Every remaining unused topic is in the bucket we're trying to avoid;
        # better to repeat a bucket than to stall the pipeline.
        logger.warning(
            "No unused topics outside bucket %r; falling back to that bucket.",
            avoid_bucket,
        )
        candidates = unused

    chosen = candidates[0]  # oldest unused first (insertion order preserved)

    if mark_used:
        chosen["used_date"] = date.today().isoformat()
        _save_topics(topics_path, topics)
        logger.info(
            "Selected topic %r (bucket=%s, angle=%s) and marked used_date=%s",
            chosen["topic"],
            chosen["bucket"],
            chosen["angle"],
            chosen["used_date"],
        )

    return chosen


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    topic = pick_next_topic()
    print(json.dumps(topic, indent=2))
