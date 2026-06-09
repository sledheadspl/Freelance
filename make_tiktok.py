"""
Generates gold-mining-promo.mp4 — TikTok-ready (1080×1920, H.264, ~45s)
Uses Pillow for frames, ffmpeg for encoding.
"""
import os, math, random, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── Config ────────────────────────────────────────────────────────────────────
W, H   = 1080, 1920
FPS    = 30
FRAMES_DIR = '/tmp/gold_frames'
OUT    = '/home/user/Freelance/gold-mining-promo.mp4'

os.makedirs(FRAMES_DIR, exist_ok=True)

# ── Palette ───────────────────────────────────────────────────────────────────
BG      = (12, 10, 7)
GOLD    = (255, 184, 0)
GOLD2   = (255, 220, 100)
GOLDIM  = (120, 90, 20)
WHITE   = (245, 237, 208)
MUTED   = (100, 88, 60)
DARK2   = (20, 16, 10)
RED_ACC = (220, 60, 60)

# ── Fonts ──────────────────────────────────────────────────────────────────────
FONT_DIR = '/tmp/fonts'
def font(name, size):
    path_map = {
        'heading': f'{FONT_DIR}/Anton.ttf',
        'bebas':   f'{FONT_DIR}/BebasNeue.ttf',
        'mono':    f'{FONT_DIR}/SpaceMono-Regular.ttf',
        'mono_b':  f'{FONT_DIR}/SpaceMono-Bold.ttf',
    }
    return ImageFont.truetype(path_map[name], size)

# ── Scenes ────────────────────────────────────────────────────────────────────
# (eyebrow, headline_lines, sub, duration_secs)
SCENES = [
    {
        'eyebrow':   'MURRAY GOLD BELT · NORTHERN IDAHO',
        'headline':  ['THE LAST', 'GREAT', 'GOLD RUSH'],
        'hl_colors': [WHITE, WHITE, GOLD],
        'sub':       '310,000 oz recovered. One of the richest\nplacer districts in the lower 48.',
        'secs':      6.0,
        'accent':    'SUMMER 2027 — WE\'RE GOING BACK IN',
    },
    {
        'eyebrow':   'DAISY GULCH GOLD CO.',
        'headline':  ['REAL', 'MINING.', 'REAL GOLD.'],
        'hl_colors': [WHITE, WHITE, GOLD],
        'sub':       '10-person crew. Mountain creek.\nShovels in the ground. Filmed weekly.',
        'secs':      5.5,
        'accent':    'NOT A REALITY SHOW. NOT A SCHEME.',
    },
    {
        'eyebrow':   'PAID POSITION · JUNE – SEPTEMBER 2027',
        'headline':  ['$150–$250', 'PER DAY', '+ GOLD'],
        'hl_colors': [GOLD, WHITE, GOLD2],
        'sub':       'Base daily rate every single day.\n70 working days. Room & camp provided.',
        'secs':      6.0,
        'accent':    'NO EXPERIENCE REQUIRED',
    },
    {
        'eyebrow':   'PRODUCTION BONUS · MID-SEASON CASE',
        'headline':  ['$20K–$40K', 'IN GOLD', 'ON TOP.'],
        'hl_colors': [GOLD, GOLD2, WHITE],
        'sub':       '75% of every ounce goes to the crew pool.\nHit a pay streak — that number climbs.',
        'secs':      6.0,
        'accent':    'DAILY RATE + YOUR SHARE OF EVERY OUNCE',
    },
    {
        'eyebrow':   'WHO WE\'RE LOOKING FOR',
        'headline':  ['YOU DON\'T', 'NEED EXP.', 'NEED GRIT.'],
        'hl_colors': [WHITE, WHITE, GOLD],
        'sub':       'Physically fit · Comfortable on camera\nReliable · Any background welcome',
        'secs':      6.0,
        'accent':    'I\'LL TEACH YOU EVERYTHING',
    },
    {
        'eyebrow':   'BEFORE THE SEASON STARTS',
        'headline':  ['ONE DAY.', 'GET PAID.', 'DECIDE.'],
        'hl_colors': [WHITE, GOLD, WHITE],
        'sub':       'Paid trial day — come to the site,\ndo real work, get paid. We both decide.',
        'secs':      5.5,
        'accent':    'NO COMMITMENT UNTIL YOU\'VE SEEN IT',
    },
    {
        'eyebrow':   'APPLICATIONS OPEN · FIRST CREW',
        'headline':  ['JUNE', '2027.', 'IN?'],
        'hl_colors': [WHITE, GOLD, GOLD2],
        'sub':       'DM or comment. Tell us who you are,\nwhy this caught your eye.',
        'secs':      7.0,
        'accent':    '#GOLDMINING  #IDAHO  #MURRAYGOLDBELT',
    },
]

# ── Utility ───────────────────────────────────────────────────────────────────
rng = random.Random(42)

def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return a + (b - a) * t

def ease_out(t):
    return 1 - (1 - t) ** 3

def ease_in_out(t):
    return t * t * (3 - 2 * t)

def alpha_composite_color(base_img, color, alpha):
    """Blend a solid color over the image at given alpha (0–255)."""
    overlay = Image.new('RGBA', base_img.size, color + (alpha,))
    return Image.alpha_composite(base_img.convert('RGBA'), overlay).convert('RGB')

# ── Gold particles (pre-computed per scene) ───────────────────────────────────
N_PARTICLES = 80

def make_particles():
    return [{
        'x': rng.uniform(0, W),
        'y': rng.uniform(0, H),
        'vy': rng.uniform(-1.2, -0.3),
        'vx': rng.uniform(-0.3, 0.3),
        'size': rng.uniform(1.5, 5),
        'alpha': rng.uniform(0.3, 1.0),
        'decay': rng.uniform(0.004, 0.010),
        'bright': rng.random() > 0.4,
    } for _ in range(N_PARTICLES)]

def step_particles(ps, dt=1.0):
    out = []
    # respawn rate
    for _ in range(int(rng.random() < 0.6 * dt * 30) ):
        ps.append({
            'x': rng.uniform(0, W),
            'y': H + rng.uniform(0, 20),
            'vy': rng.uniform(-1.2, -0.3),
            'vx': rng.uniform(-0.3, 0.3),
            'size': rng.uniform(1.5, 5),
            'alpha': rng.uniform(0.4, 1.0),
            'decay': rng.uniform(0.004, 0.008),
            'bright': rng.random() > 0.4,
        })
    for p in ps:
        p['x'] += p['vx'] + math.sin(p['y'] * 0.02) * 0.3
        p['y'] += p['vy']
        p['alpha'] -= p['decay']
        if p['alpha'] > 0 and p['y'] > -20:
            out.append(p)
    return out

def draw_particles(img_arr, ps):
    """Draw diamond/circle particles directly on an RGBA image."""
    draw = ImageDraw.Draw(img_arr)
    for p in ps:
        if p['alpha'] <= 0:
            continue
        a = int(p['alpha'] * 255)
        c = GOLD if p['bright'] else GOLDIM
        c_a = c + (a,)
        x, y, s = p['x'], p['y'], p['size']
        if s > 3:
            pts = [(x, y-s), (x+s*0.55, y), (x, y+s), (x-s*0.55, y)]
            draw.polygon(pts, fill=c_a)
        else:
            draw.ellipse([x-s, y-s, x+s, y+s], fill=c_a)

# ── Grid background ───────────────────────────────────────────────────────────
def make_bg_grid():
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)
    step = 60
    lc = (255, 184, 0, 8)  # very faint gold
    grid_overlay = Image.new('RGBA', (W, H), (0,0,0,0))
    gd = ImageDraw.Draw(grid_overlay)
    for x in range(0, W+1, step):
        gd.line([(x,0),(x,H)], fill=(255,184,0,10), width=1)
    for y in range(0, H+1, step):
        gd.line([(0,y),(W,y)], fill=(255,184,0,10), width=1)
    img = Image.alpha_composite(img.convert('RGBA'), grid_overlay).convert('RGB')
    return img

BG_GRID = make_bg_grid()

# ── Vignette ──────────────────────────────────────────────────────────────────
def make_vignette():
    v = Image.new('RGBA', (W, H), (0,0,0,0))
    draw = ImageDraw.Draw(v)
    cx, cy = W//2, H//2
    for r in range(min(W,H)//2, 0, -2):
        ratio = r / (min(W,H)//2)
        a = int((1 - ratio) * 180)
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(0,0,0,max(0,a)))
    return v

VIGNETTE = make_vignette()

# ── Text helpers ──────────────────────────────────────────────────────────────
def centered_text(draw, text, y, fnt, fill, shadow=True):
    bb = draw.textbbox((0,0), text, font=fnt)
    tw = bb[2] - bb[0]
    x = (W - tw) // 2
    if shadow:
        draw.text((x+3, y+3), text, font=fnt, fill=(0,0,0,120))
    draw.text((x, y), text, font=fnt, fill=fill)
    return bb[3] - bb[1]  # height

def text_width(draw, text, fnt):
    bb = draw.textbbox((0,0), text, font=fnt)
    return bb[2] - bb[0]

def draw_gold_line(draw, y, width=120):
    x0 = (W - width) // 2
    draw.rectangle([x0, y, x0+width, y+3], fill=GOLD)

# ── Frame renderer ────────────────────────────────────────────────────────────
FONT_HH  = font('heading', 148)   # main headline
FONT_HM  = font('heading', 112)
FONT_HL  = font('heading', 88)
FONT_EYE = font('mono_b',  28)
FONT_SUB = font('mono',    34)
FONT_ACC = font('mono_b',  26)
FONT_TAG = font('mono_b',  24)

def pick_headline_font(longest_line):
    """Choose font size based on longest headline line."""
    for fnt in [FONT_HH, FONT_HM, FONT_HL]:
        dummy = Image.new('RGB', (1,1))
        d = ImageDraw.Draw(dummy)
        bb = d.textbbox((0,0), longest_line, font=fnt)
        if bb[2] - bb[0] < W - 60:
            return fnt
    return FONT_HL

def render_frame(scene, t_scene, particles, transition_alpha=0):
    """
    scene       : scene dict
    t_scene     : 0.0–1.0 position within scene
    particles   : current particle list
    transition_alpha : 0–255 black overlay for transitions
    """
    img = BG_GRID.copy().convert('RGBA')

    # Particles layer
    p_layer = Image.new('RGBA', (W, H), (0,0,0,0))
    draw_particles(p_layer, particles)
    img = Image.alpha_composite(img, p_layer)

    # Vignette
    img = Image.alpha_composite(img, VIGNETTE)

    # Accent glow at top (gold)
    glow = Image.new('RGBA', (W, H), (0,0,0,0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-200, -300, W+200, 400], fill=(255,184,0,18))
    img = Image.alpha_composite(img, glow)

    # Draw text ────────────────────────────────────────────────────────────────
    draw = ImageDraw.Draw(img)

    # Stagger: eyebrow appears at t=0.05, headline at 0.12, sub at 0.25, accent at 0.40
    def fade(start, end, t):
        return min(255, int(ease_out(max(0, (t - start)/(end - start))) * 255))

    alpha_eye  = fade(0.03, 0.18, t_scene)
    alpha_hl   = fade(0.10, 0.28, t_scene)
    alpha_sub  = fade(0.22, 0.40, t_scene)
    alpha_acc  = fade(0.36, 0.52, t_scene)

    # Slide-up offsets
    def slide(start, t, dist=40):
        raw = max(0, (t - start) / 0.18)
        return int((1 - ease_out(min(1, raw))) * dist)

    off_eye = slide(0.03, t_scene)
    off_hl  = slide(0.10, t_scene)
    off_sub = slide(0.22, t_scene)
    off_acc = slide(0.36, t_scene)

    # Layout constants
    TOP_PAD   = 200
    HL_START  = 360

    # ── Eyebrow ──
    if alpha_eye > 0:
        ey = TOP_PAD + off_eye - 20
        # gold pill behind eyebrow
        bb = draw.textbbox((0,0), scene['eyebrow'], font=FONT_EYE)
        tw = bb[2]-bb[0]; th = bb[3]-bb[1]
        px = (W - tw)//2 - 20
        draw.rectangle([px-2, ey-6, px+tw+22, ey+th+8], fill=(255,184,0,int(alpha_eye*0.15)))
        draw.line([(px, ey+th+14), (px+tw+20, ey+th+14)], fill=GOLD+(alpha_eye,), width=2)
        e_col = GOLD + (alpha_eye,)
        draw.text(((W-tw)//2, ey), scene['eyebrow'], font=FONT_EYE, fill=e_col)

    # ── Headline ──
    if alpha_hl > 0:
        longest = max(scene['headline'], key=len)
        hfnt = pick_headline_font(longest)
        cy = HL_START + off_hl
        for i, (line, col) in enumerate(zip(scene['headline'], scene['hl_colors'])):
            bb = draw.textbbox((0,0), line, font=hfnt)
            lh = bb[3]-bb[1]
            # shadow
            draw.text(((W-(bb[2]-bb[0]))//2 + 4, cy + 4), line, font=hfnt, fill=(0,0,0,int(alpha_hl*0.5)))
            if col == GOLD:
                # glow effect: draw twice with blur sim
                draw.text(((W-(bb[2]-bb[0]))//2 - 2, cy - 2), line, font=hfnt, fill=GOLD+(int(alpha_hl*0.3),))
            draw.text(((W-(bb[2]-bb[0]))//2, cy), line, font=hfnt, fill=col+(alpha_hl,))
            cy += lh + 8

        # Gold divider line
        line_y = cy + 20
        line_alpha = fade(0.18, 0.32, t_scene)
        lw = int(lerp(0, 140, ease_out(max(0,(t_scene-0.18)/0.14))))
        if lw > 0:
            x0 = (W-140)//2; x1 = x0 + lw
            draw.rectangle([x0, line_y, x1, line_y+3], fill=GOLD+(line_alpha,))
        SUB_Y = line_y + 30
    else:
        SUB_Y = HL_START + 440

    # ── Sub ──
    if alpha_sub > 0:
        sub_lines = scene['sub'].split('\n')
        sy = SUB_Y + off_sub + 20
        for line in sub_lines:
            bb = draw.textbbox((0,0), line, font=FONT_SUB)
            tw = bb[2]-bb[0]; th = bb[3]-bb[1]
            draw.text(((W-tw)//2, sy), line, font=FONT_SUB, fill=MUTED+(alpha_sub,))
            sy += th + 12

    # ── Accent bar at bottom ──
    if alpha_acc > 0:
        acc_y = H - 220 + off_acc
        # Bar background
        bb = draw.textbbox((0,0), scene['accent'], font=FONT_ACC)
        tw = bb[2]-bb[0]; th = bb[3]-bb[1]
        px = (W-tw)//2 - 24
        draw.rectangle([0, acc_y-14, W, acc_y+th+20], fill=(255,184,0,int(alpha_acc*0.12)))
        draw.line([(0, acc_y-14), (W, acc_y-14)], fill=GOLD+(int(alpha_acc*0.5),), width=1)
        draw.text(((W-tw)//2, acc_y), scene['accent'], font=FONT_ACC, fill=WHITE+(alpha_acc,))

    # ── Transition overlay ──
    if transition_alpha > 0:
        ov = Image.new('RGBA', (W, H), (0,0,0,transition_alpha))
        img = Image.alpha_composite(img, ov)

    return img.convert('RGB')

# ── Main loop ─────────────────────────────────────────────────────────────────
FADE_FRAMES = int(FPS * 0.4)  # 12 frames fade between scenes
frame_idx   = 0
particles   = make_particles()
total_scenes = len(SCENES)

print(f'Rendering frames to {FRAMES_DIR}...')

for s_idx, scene in enumerate(SCENES):
    scene_frames = int(scene['secs'] * FPS)
    print(f'  Scene {s_idx+1}/{total_scenes}: {scene_frames} frames')

    for f in range(scene_frames):
        t_scene = f / max(scene_frames - 1, 1)

        # transition in (fade from black)
        if f < FADE_FRAMES:
            tr_alpha = int((1 - f/FADE_FRAMES) * 255)
        # transition out (fade to black)
        elif f > scene_frames - FADE_FRAMES:
            tr_alpha = int(((f - (scene_frames - FADE_FRAMES)) / FADE_FRAMES) * 255)
        else:
            tr_alpha = 0

        particles = step_particles(particles)
        frame = render_frame(scene, t_scene, particles, tr_alpha)
        frame.save(f'{FRAMES_DIR}/frame_{frame_idx:05d}.png')
        frame_idx += 1

print(f'Total frames: {frame_idx}')
print('Encoding MP4 with ffmpeg...')

cmd = [
    'ffmpeg', '-y',
    '-framerate', str(FPS),
    '-i', f'{FRAMES_DIR}/frame_%05d.png',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    OUT
]
result = subprocess.run(cmd, capture_output=True, text=True)
if result.returncode != 0:
    print('ffmpeg error:', result.stderr[-1000:])
else:
    size_mb = os.path.getsize(OUT) / 1024 / 1024
    duration = frame_idx / FPS
    print(f'Done! {OUT}  ({size_mb:.1f} MB, {duration:.1f}s)')
