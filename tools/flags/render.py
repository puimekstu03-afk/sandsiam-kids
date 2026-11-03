"""Renders the national flags in flags.html to transparent WebP decorations.

Each flag is screenshotted by headless Chrome at twice its size and saved as
public/assets/ornaments/flag-<key>.webp at the Thai flag's size (219 × 640), on its pole.

    python3 tools/flags/render.py [key ...]     (every flag when no key is given)
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / 'public' / 'assets' / 'ornaments'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
# Must match the flag-<key> entries in catalog.js.
KEYS = ['taiwan', 'uk', 'usa', 'japan', 'china', 'india', 'korea', 'germany', 'myanmar']


def render(key, tmp):
    shot = Path(tmp) / f'{key}.png'
    subprocess.run([
        CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
        f'--user-data-dir={tmp}/profile', '--window-size=219,640', '--force-device-scale-factor=2',
        '--default-background-color=00000000', '--virtual-time-budget=4000', f'--screenshot={shot}',
        f'{(HERE / "flags.html").as_uri()}?f={key}',
    ], check=True, capture_output=True)
    img = Image.open(shot).convert('RGBA').resize((219, 640), Image.LANCZOS)
    img.save(OUT / f'flag-{key}.webp', 'WEBP', quality=90, method=6, alpha_quality=92)
    print(f'flag-{key}: {img.width}x{img.height}')


if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as tmp:
        for key in sys.argv[1:] or KEYS:
            render(key, tmp)
