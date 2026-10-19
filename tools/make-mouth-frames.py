"""Makes the talking frames for the guide: each pose gets a half-open and a closed mouth.

The guide pictures (public/assets/guide/mascot-<pose>.png) have one painted mouth each.
This script paints the mouth over with sand copied from just above it, then puts back a
squashed copy of the mouth (half open) or draws a smile line (closed). The thinking pose
already has a closed smile, so it borrows the waving pose's open mouth instead.

    python3 tools/make-mouth-frames.py

writes public/assets/guide/mascot-<pose>-<frame>.png for frames open, mid and closed
(the frame that matches the original picture is skipped; main.js uses the original).
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

GUIDE = Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'guide'
SS = 4  # supersampling for drawn lines

# The painted mouth of each pose: left, top, right, bottom in picture pixels.
MOUTHS = {
    'wave': (115, 217, 152, 248),
    'cheer': (116, 204, 167, 238),
    'point': (93, 213, 130, 242),
    'think': (85, 215, 117, 226),
}
LINE = (74, 34, 18, 255)  # dark brown, like the eyebrows and the thinking smile


def mouth_mask(img, box):
    """Soft mask of the painted mouth (dark inside, pink tongue and its pressed-in rim)."""
    a = np.asarray(img).astype(int)
    l, t, r, b = box
    m = np.zeros(a.shape[:2], bool)
    region = a[t:b, l:r]
    rr, gg, bb = region[..., 0], region[..., 1], region[..., 2]
    m[t:b, l:r] = (rr < 200) | (bb > 110) | (gg < 150)
    mask = Image.fromarray((m * 255).astype(np.uint8))
    return mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5))


def erase(img, box):
    """Paints the mouth over with sand: colour diffused in from around it, plus sand grain."""
    soft = np.asarray(mouth_mask(img, box).filter(ImageFilter.MaxFilter(3))).astype(float) / 255
    hole = soft > 0.02
    a = np.asarray(img).astype(float)
    rgb = a[..., :3].copy()
    # Fill the hole by repeatedly averaging neighbours, keeping the sand around it fixed.
    rgb[hole] = rgb[~hole & (a[..., 3] > 200)].mean(0)
    for _ in range(400):
        avg = (np.roll(rgb, 1, 0) + np.roll(rgb, -1, 0) + np.roll(rgb, 1, 1) + np.roll(rgb, -1, 1)) / 4
        rgb[hole] = avg[hole]
    # Sand grain: soft random speckle as strong as the grain on the skin just above the mouth.
    l, t, r, b = box
    cx = (l + r) // 2
    strip = a[t - 12:t - 4, cx - 6:cx + 6, :3]
    rng = np.random.default_rng(7)
    noise = Image.fromarray(np.uint8(rng.integers(0, 256, rgb.shape[:2]))).filter(ImageFilter.GaussianBlur(0.6))
    noise = np.asarray(noise).astype(float)
    noise = (noise - noise.mean()) / noise.std()
    rgb[hole] += (noise[..., None] * strip.std((0, 1)))[hole]
    out = a.copy()
    w = soft[..., None]
    out[..., :3] = a[..., :3] * (1 - w) + rgb * w
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def mouth_piece(img, box):
    """The painted mouth cut out with its soft mask."""
    l, t, r, b = box
    piece = img.crop((l - 3, t - 3, r + 3, b + 3))
    piece.putalpha(mouth_mask(img, box).crop((l - 3, t - 3, r + 3, b + 3)))
    return piece


def squash(piece, sx, sy):
    w, h = piece.size
    return piece.resize((max(1, round(w * sx)), max(1, round(h * sy))), Image.LANCZOS)


def paste_top_centre(img, piece, cx, top):
    out = img.copy()
    out.alpha_composite(piece, (round(cx - piece.width / 2), round(top)))
    return out


def smile(img, box, width_ratio=0.62, sag=4):
    """Draws a closed smiling mouth along the top of the mouth box."""
    l, t, r, b = box
    cx = (l + r) / 2
    w = (r - l) * width_ratio
    layer = Image.new('RGBA', (img.width * SS, img.height * SS), (0, 0, 0, 0))
    y = t + 5
    ImageDraw.Draw(layer).arc(
        ((cx - w / 2) * SS, (y - sag) * SS, (cx + w / 2) * SS, (y + sag) * SS),
        start=15, end=165, fill=LINE, width=round(2.2 * SS))
    out = img.copy()
    out.alpha_composite(layer.resize(img.size, Image.LANCZOS))
    return out


def main():
    wave = Image.open(GUIDE / 'mascot-wave.png').convert('RGBA')
    wave_mouth = mouth_piece(wave, MOUTHS['wave'])
    for pose, box in MOUTHS.items():
        img = Image.open(GUIDE / f'mascot-{pose}.png').convert('RGBA')
        bare = erase(img, box)
        l, t, r, b = box
        cx = (l + r) / 2
        frames = {}
        if pose == 'think':
            # Borrow a smaller open mouth; the original picture is the closed frame.
            open_piece = squash(wave_mouth, 0.82, 0.82)
            frames['open'] = paste_top_centre(bare, open_piece, cx, t - 2)
            frames['mid'] = paste_top_centre(bare, squash(open_piece, 0.9, 0.5), cx, t - 2)
        else:
            piece = mouth_piece(img, box)
            frames['mid'] = paste_top_centre(bare, squash(piece, 0.92, 0.5), cx, t - 3)
            frames['closed'] = smile(bare, box)
        for name, frame in frames.items():
            frame.save(GUIDE / f'mascot-{pose}-{name}.png', optimize=True)
            print(f'mascot-{pose}-{name}.png')


if __name__ == '__main__':
    main()
