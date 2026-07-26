"""SQLite-backed posting log shared by the QC gate and the per-platform
publish scripts.

Tracks every attempted post (date, topic, bucket, angle, platform, post id,
status) so the QC gate can dedupe recent topic/angle combos and so the
pipeline has a full audit trail.
"""

from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "posting_log.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS posting_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_date TEXT NOT NULL,
    topic TEXT NOT NULL,
    bucket TEXT NOT NULL,
    angle TEXT NOT NULL,
    platform TEXT NOT NULL,
    post_id TEXT,
    status TEXT NOT NULL,
    detail TEXT
);
"""


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute(SCHEMA)
    conn.commit()
    return conn


def log_post(
    topic: str,
    bucket: str,
    angle: str,
    platform: str,
    status: str,
    post_id: str | None = None,
    detail: str | None = None,
    post_date: str | None = None,
    db_path: Path = DB_PATH,
) -> None:
    post_date = post_date or date.today().isoformat()
    conn = get_connection(db_path)
    with conn:
        conn.execute(
            """INSERT INTO posting_log
               (post_date, topic, bucket, angle, platform, post_id, status, detail)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (post_date, topic, bucket, angle, platform, post_id, status, detail),
        )
    conn.close()


def was_topic_angle_used_recently(
    topic: str, angle: str, within_days: int = 60, db_path: Path = DB_PATH
) -> bool:
    """True if this exact topic/angle combo was successfully posted within
    the last `within_days` days, per the QC gate's dedupe rule.
    """
    cutoff = (date.today() - timedelta(days=within_days)).isoformat()
    conn = get_connection(db_path)
    row = conn.execute(
        """SELECT 1 FROM posting_log
           WHERE topic = ? AND angle = ? AND status = 'published' AND post_date >= ?
           LIMIT 1""",
        (topic, angle, cutoff),
    ).fetchone()
    conn.close()
    return row is not None


def recent_posts(within_days: int = 60, db_path: Path = DB_PATH) -> list[dict]:
    cutoff = (date.today() - timedelta(days=within_days)).isoformat()
    conn = get_connection(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM posting_log WHERE post_date >= ? ORDER BY post_date DESC", (cutoff,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
