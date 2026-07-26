"""Local LLM script generation via Ollama.

No paid API calls here: this module talks to a local Ollama server
(http://localhost:11434 by default) running an open-source model pulled
ahead of time (see README.md for setup).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import requests

from hook_template import SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger(__name__)

FACTS_DIR = Path(__file__).parent.parent / "topics" / "facts"

BUCKET_TO_FACTS_FILE = {
    "Budgeting & Saving": "budgeting_saving.json",
    "Debt": "debt.json",
    "Investing Basics": "investing_basics.json",
    "Credit": "credit.json",
    "Taxes": "taxes.json",
    "Money Psychology": "money_psychology.json",
    "Life-Stage Money": "life_stage_money.json",
    "Myth-Busting": "myth_busting.json",
}


class ScriptGenerationError(RuntimeError):
    """Raised when the LLM fails to produce valid script JSON after retries."""


def load_facts_for_bucket(bucket: str, facts_dir: Path = FACTS_DIR) -> list[dict]:
    filename = BUCKET_TO_FACTS_FILE.get(bucket)
    if not filename:
        logger.warning("No facts file mapping for bucket %r; proceeding with no facts.", bucket)
        return []
    path = facts_dir / filename
    if not path.exists():
        logger.warning("Facts file %s not found; proceeding with no facts.", path)
        return []
    return json.loads(path.read_text())["facts"]


def _call_ollama(
    system_prompt: str,
    user_prompt: str,
    model: str,
    base_url: str,
    temperature: float,
) -> str:
    resp = requests.post(
        f"{base_url.rstrip('/')}/api/chat",
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "format": "json",
            "stream": False,
            "options": {"temperature": temperature},
        },
        timeout=180,
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"]


def _validate_script(raw: str) -> dict[str, Any]:
    data = json.loads(raw)  # raises json.JSONDecodeError on malformed JSON

    if not isinstance(data.get("hook"), str) or not data["hook"].strip():
        raise ValueError("Missing or empty 'hook'")
    if not isinstance(data.get("close"), str) or not data["close"].strip():
        raise ValueError("Missing or empty 'close'")

    segments = data.get("body_segments")
    if not isinstance(segments, list) or not segments:
        raise ValueError("Missing or empty 'body_segments'")
    for i, seg in enumerate(segments):
        if not isinstance(seg.get("narration"), str) or not seg["narration"].strip():
            raise ValueError(f"body_segments[{i}] missing 'narration'")
        if not isinstance(seg.get("visual_keyword"), str) or not seg["visual_keyword"].strip():
            raise ValueError(f"body_segments[{i}] missing 'visual_keyword'")

    return data


def generate_script(
    topic: str,
    bucket: str,
    angle: str,
    model: str = "llama3.1:8b",
    base_url: str = "http://localhost:11434",
    temperature: float = 0.8,
    max_attempts: int = 2,
) -> dict[str, Any]:
    """Generate a structured script dict via a local Ollama model.

    Retries generation once (max_attempts=2 by default) if the model returns
    malformed/incomplete JSON.
    """
    facts = load_facts_for_bucket(bucket)
    user_prompt = build_user_prompt(topic, bucket, angle, facts)

    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        logger.info("Generating script for topic=%r (attempt %d/%d)", topic, attempt, max_attempts)
        try:
            raw = _call_ollama(SYSTEM_PROMPT, user_prompt, model, base_url, temperature)
            script = _validate_script(raw)
            logger.info("Script generated successfully for topic=%r", topic)
            return script
        except (requests.RequestException, json.JSONDecodeError, ValueError) as exc:
            last_error = exc
            logger.warning("Script generation attempt %d failed: %s", attempt, exc)

    raise ScriptGenerationError(
        f"Failed to generate a valid script for topic={topic!r} after {max_attempts} attempts"
    ) from last_error


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Generate a finance short script via local Ollama")
    parser.add_argument("--topic", required=True)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--angle", required=True)
    parser.add_argument("--model", default="llama3.1:8b")
    args = parser.parse_args()

    script = generate_script(args.topic, args.bucket, args.angle, model=args.model)
    print(json.dumps(script, indent=2))
