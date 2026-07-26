# finance-bot

Fully automated pipeline that produces one original, publish-ready short-form
finance video per day, end to end, with zero ongoing API cost in the
content-generation loop. Script generation, text-to-speech, and captioning all
run on local, open-source models. Free-tier APIs are used only for stock
footage/music sourcing and platform posting.

## Hard constraints this project enforces

- **No paid APIs in the generation loop.** LLM scripting runs on a local
  Ollama model, TTS runs on local Piper, captioning runs on local
  faster-whisper.
- **Original synthesis only.** The script generator is given a topic + a
  vetted facts list — never a transcript, summary, or "reference video" of any
  specific existing creator's content. Nothing in this repo ingests a specific
  video's script as the basis for a new one; if you want that feature, it
  needs to be added deliberately and separately, with its own review.
- **No fabricated statistics.** Numeric claims come only from
  `topics/facts/*.json`, a small hand-curated reference set — the LLM is
  instructed not to invent figures, and reviewers should periodically
  re-check those files rather than trust the model to keep them current.
- **QC gate before publish.** `qc/quality_check.py` must pass before a video
  is handed to `publish/`. Anything that fails is moved to `review/` with the
  failure reason logged next to it.

## Project structure

```
finance-bot/
  topics/
    topics.json            # seeded topic bank (360 entries, 8 buckets x 9 subjects x 5 angles)
    build_topic_bank.py     # regenerates topics.json (re-seed only, see caveat below)
    facts/                  # per-bucket vetted reference facts
  scripts/
    topic_selector.py       # picks + marks the next topic to produce
    generate_script.py      # local LLM (Ollama) script generation
    hook_template.py        # retention-hook prompt template
  audio/
    tts_render.py           # Piper TTS rendering + segment-timing manifest
  visuals/
    fetch_stock.py          # Pexels/Pixabay footage fetch + local cache
    assemble_video.py       # MoviePy assembly (9:16, narration + music)
  captions/
    caption_burn.py         # faster-whisper timestamps + ffmpeg burn-in
  thumbnails/
    make_thumbnail.py       # Pillow thumbnail generator
  qc/
    quality_check.py        # automated pre-publish gate
  publish/
    post_youtube.py
    post_tiktok.py
    post_instagram.py
    posting_log.py          # sqlite log (posting_log.db, created at runtime)
  pipeline.py                # orchestrates the full daily run
  config.yaml                 # models, voices, paths, per-platform toggles
  .env.example                 # copy to .env and fill in free-tier keys
```

`output/`, `review/`, `logs/`, and `stock_cache/` are created at runtime and
are gitignored.

## Setup

### 1. Python environment

```bash
cd finance-bot
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

You'll also need `ffmpeg` and `ffprobe` on PATH (used for QC checks and
caption burn-in):

```bash
sudo apt-get install ffmpeg   # or brew install ffmpeg on macOS
```

### 2. Ollama (local LLM)

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1:8b     # or another instruct model that fits your hardware
ollama serve                 # runs the local API server on localhost:11434
```

`config.yaml` -> `llm.model` controls which model is used; swap to a smaller
model (e.g. `llama3.2:3b`) on limited hardware.

### 3. Piper (local TTS)

```bash
pip install piper-tts
mkdir -p voices
curl -L -o voices/en_US-lessac-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
curl -L -o voices/en_US-lessac-medium.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

Browse more voices at the [Piper voice samples page](https://rhasspy.github.io/piper-samples/).
Update `config.yaml` -> `tts.voice_model_path` if you use a different voice.

(Coqui TTS is a supported alternative if you prefer it — swap the
implementation in `audio/tts_render.py`; the rest of the pipeline only
depends on getting a `.wav` + segment manifest out of that stage.)

### 4. faster-whisper (local captioning)

Installed via `requirements.txt`. First run downloads the chosen model
(`captions.whisper_model_size` in `config.yaml`, default `base`) to a local
cache — no ongoing API calls.

### 5. Stock footage/music API keys (free tier)

- **Pexels**: sign up at https://www.pexels.com/api/ and generate an API key.
- **Pixabay**: sign up at https://pixabay.com/api/docs/ and generate an API key.

Put both in `.env` (copy `.env.example` first):

```bash
cp .env.example .env
# then edit .env and fill in PEXELS_API_KEY / PIXABAY_API_KEY
```

For background music, download a track you're licensed to use (e.g. Pixabay
Music or the YouTube Audio Library) and place it at the path set in
`config.yaml` -> `video.background_music_path`.

### 6. Platform posting credentials (free tier)

**YouTube Data API v3**
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/), enable the YouTube Data API v3.
2. Create an OAuth 2.0 Client ID (Desktop app), download the JSON as
   `secrets/youtube_client_secret.json`.
3. First run of `pipeline.py` opens a browser for one-time consent; the
   resulting token is cached to `secrets/youtube_token.json` for subsequent
   unattended runs.

**TikTok Content Posting API**
1. Register an app at the [TikTok for Developers portal](https://developers.tiktok.com/) and request the `video.publish` scope.
2. Complete the OAuth flow to get an access token; set `TIKTOK_ACCESS_TOKEN`
   in `.env`.
3. Unaudited apps can only post with `privacy_level: SELF_ONLY` (draft/private
   to your own account). `config.yaml` defaults `tiktok.enabled: false` and
   `privacy_level: SELF_ONLY` until your app passes TikTok's audit for public
   posting — flip `enabled: true` (and the privacy level once approved) when
   ready.

**Instagram Graph API**
1. Requires a Facebook app + an Instagram **Business** account linked to a
   Facebook Page.
2. Generate a long-lived Page access token with `instagram_content_publish`
   permission via [Meta for Developers](https://developers.facebook.com/).
3. Set `INSTAGRAM_BUSINESS_ACCOUNT_ID` and `INSTAGRAM_ACCESS_TOKEN` in `.env`.
4. The Graph API requires a **publicly reachable video URL**, not a raw file
   upload — set `publishing.platforms.instagram.public_video_url_base` in
   `config.yaml` to wherever your rendered `output/<date>/video_captioned.mp4`
   files are reachable from (your own static hosting/CDN/object storage).
   `config.yaml` defaults `instagram.enabled: false` until this is set up.

## Topic bank

`topics/topics.json` ships pre-seeded with 360 entries across 8 buckets
(Budgeting & Saving, Debt, Investing Basics, Credit, Taxes, Money Psychology,
Life-Stage Money, Myth-Busting). Each run picks the oldest unused entry,
skipping the bucket used most recently so the same bucket doesn't run two
days in a row, and marks it `used_date`.

At ~1 post/day, 360 topics last close to a year. To refill, either hand-add
entries to `topics.json` (recommended once you're past the initial seed, so
you don't lose `used_date` history) or edit `topics/build_topic_bank.py`
and re-run it — note this **overwrites** `topics.json`, so back up any
`used_date` progress first if you go that route.

## Facts reference files

`topics/facts/*.json` hold the only numeric claims the script generator is
allowed to draw from — see `topics/facts/README.md` for maintenance
guidelines. These are meant to be reviewed by a human periodically, not
auto-expanded by the LLM.

## Running it

```bash
python pipeline.py
```

One run: picks a topic, generates a script, renders TTS, assembles the video,
burns captions, generates a thumbnail, runs the QC gate, and either publishes
to enabled platforms or routes the render to `review/<date>/` with a
`.qc_failure.txt` reason file. Everything is logged to
`logs/pipeline_<date>.log` and stdout, with each stage clearly marked so a
failure is traceable to exactly where it happened.

Toggle which platforms actually post in `config.yaml` ->
`publishing.platforms.*.enabled` — all default to a safe/off or private state
until you've completed that platform's setup above.

### Cron entry for a fully unattended daily run

Runs every day at 9:00 AM server time:

```cron
0 9 * * * cd /path/to/finance-bot && /path/to/finance-bot/.venv/bin/python pipeline.py >> logs/cron.log 2>&1
```

Make sure `ollama serve` is running (or running as a systemd service) before
the cron job fires, since script generation depends on it.

## Hardware

- **GPU recommended** for both the Ollama model and faster-whisper — a
  single 45-90 second video typically renders in a few minutes end-to-end.
- **CPU-only works** but is noticeably slower, mostly in LLM generation and
  Whisper transcription; expect a low-to-mid single-digit-minutes runtime to
  stretch to 10-20+ minutes depending on model size and CPU. Using a smaller
  Ollama model (e.g. `llama3.2:3b`) and `whisper_model_size: base` or
  `tiny` keeps CPU-only runs reasonable.

## Acceptance checklist

- `python pipeline.py` produces one complete, captioned, thumbnailed vertical
  video in `output/<date>/`, either published or routed to `review/<date>/`
  with a clear per-stage log.
- No step in script generation / TTS / captioning calls a paid API.
- No step ingests a specific existing video's transcript as the basis for a
  new script — `generate_script.py` only ever receives a topic + vetted
  generic facts, never a transcript.
- `topics.json` and the posting log (`publish/posting_log.db`) both update
  after each run, so the next run picks a new topic and the QC gate refuses
  to re-publish a topic/angle combo used in the last 60 days.
