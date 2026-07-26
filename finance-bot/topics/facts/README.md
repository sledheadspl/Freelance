# Facts reference files

Each `<bucket>.json` file here is a small, hand-curated list of well-established,
generic financial facts and rules of thumb for that topic bucket. These are the
**only** source of numeric claims the script generator is allowed to use — the
LLM is instructed to pull from this list rather than invent figures.

Guidelines for maintaining these files:

- Keep entries generic and durable (rules of thumb, widely-cited ranges), not
  hyper-specific point-in-time statistics that go stale fast.
- Every entry has a `caveat` field noting it's a general guideline, not
  individualized financial advice, and that ranges shift over time/by source.
- Re-review this file every few months. Do not let the LLM "expand" it —
  edits here should be manual/human-reviewed.
- Do not add facts attributed to a specific named study or dataset unless
  you're prepared to keep the citation current; prefer durable rules of thumb.
