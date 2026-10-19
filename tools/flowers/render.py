"""Renders the SVG flower heads in flowers.html to transparent WebP decorations.

Each flower is screenshotted by headless Chrome at twice its size, trimmed to what is
drawn, and saved as public/assets/ornaments/<key>.webp no larger than 400 pixels. The
flowers that flower rings are strung from are also saved small as ring-<key>.webp.

    python3 tools/flowers/render.py [key ...]     (every flower when no key is given)
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / 'public' / 'assets' / 'ornaments'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
KEYS = ['marigold', 'lotus', 'rose', 'jasmine', 'sunflower', 'hibiscus', 'plumeria', 'orchid', 'globeAmaranth', 'ixora', 'cosmos']
# Flower heads for the rings round the tiers (must match the ring lists in catalog.js).
RING_KEYS = {'marigold', 'jasmine', 'rose', 'globeAmaranth', 'plumeria', 'ixora', 'cosmos'}
MAX_SIDE = 400
RING_SIDE = 64


def render(key, tmp):
    shot = Path(tmp) / f'{key}.png'
    subprocess.run([
        CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
        f'--user-data-dir={tmp}/profile', '--window-size=400,400', '--force-device-scale-factor=2',
        '--default-background-color=00000000', f'--screenshot={shot}',
        f'{(HERE / "flowers.html").as_uri()}?f={key}',
    ], check=True, capture_output=True)
    img = Image.open(shot).convert('RGBA')
    # Trim to the flower, ignoring the faintest edge of its soft shadow.
    box = img.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    pad = 8
    img = img.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(img.width, box[2] + pad), min(img.height, box[3] + pad)))
    scale = min(1, MAX_SIDE / max(img.size))
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    img.save(OUT / f'{key}.webp', 'WEBP', quality=90, method=6, alpha_quality=92)
    print(f'{key}: {img.width}x{img.height}')
    if key in RING_KEYS:
        small = img.resize((round(img.width * RING_SIDE / max(img.size)), round(img.height * RING_SIDE / max(img.size))), Image.LANCZOS)
        small.save(OUT / f'ring-{key}.webp', 'WEBP', quality=90, method=6, alpha_quality=92)


if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as tmp:
        for key in sys.argv[1:] or KEYS:
            render(key, tmp)
