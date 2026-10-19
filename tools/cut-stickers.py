"""Cuts a sheet of cartoon stickers (on a plain white background) into transparent WebP images.

The sheet is made in Canva (generate-image): several decorations laid out in rows with
white space between them. The white that touches the edge of the sheet becomes
transparent; white inside a drawing (petals, shine) stays, because the thick outline
closes it off. Pieces are found in reading order, row by row, left to right.

    python3 tools/cut-stickers.py SHEET.png marigold,lotus,garland,rose,jasmine,sunflower [MAX_SIDE]

writes public/assets/ornaments/<name>.webp for each name, in that order, no larger than
MAX_SIDE pixels on its longest side (default 400; tall flags on poles use 640).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'ornaments'
KEY = (255, 0, 255)  # marks the background while flooding
WHITE_TOLERANCE = 38  # how far from white still counts as background
MIN_GAP = 6  # empty pixels needed between pieces
MAX_SIDE = 400  # longest side of a saved sticker (can be given on the command line)


def runs(mask):
    """[start, end) spans where mask is true, joining gaps shorter than MIN_GAP."""
    spans, start, gap = [], None, 0
    for i, on in enumerate(mask):
        if on:
            if start is None:
                start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= MIN_GAP:
                spans.append((start, i - gap + 1))
                start, gap = None, 0
    if start is not None:
        spans.append((start, len(mask) - gap))
    return spans


def cut(sheet_path, names, max_side=MAX_SIDE):
    img = Image.open(sheet_path).convert('RGB')
    w, h = img.size
    flood = img.copy()
    # Flood the background from many points round the border.
    for x in range(0, w, 24):
        for y in (0, h - 1):
            if flood.getpixel((x, y)) != KEY:
                ImageDraw.floodfill(flood, (x, y), KEY, thresh=WHITE_TOLERANCE)
    for y in range(0, h, 24):
        for x in (0, w - 1):
            if flood.getpixel((x, y)) != KEY:
                ImageDraw.floodfill(flood, (x, y), KEY, thresh=WHITE_TOLERANCE)
    a = np.array(flood)
    solid = ~np.all(a == KEY, axis=2)

    # Soft edges: shrink the shape by a pixel, then feather it.
    alpha = Image.fromarray((solid * 255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    rgba = img.copy()
    rgba.putalpha(alpha)
    solid = np.array(alpha) > 40

    pieces = []
    for y0, y1 in runs(solid.any(axis=1)):
        band = solid[y0:y1]
        for x0, x1 in runs(band.any(axis=0)):
            cell = solid[y0:y1, x0:x1]
            ys = np.where(cell.any(axis=1))[0]
            if cell.sum() < 400:  # specks
                continue
            pieces.append((x0, y0 + ys[0], x1, y0 + ys[-1] + 1))
    if len(pieces) != len(names):
        sys.exit(f'found {len(pieces)} pieces but got {len(names)} names: {pieces}')

    OUT.mkdir(parents=True, exist_ok=True)
    for name, (x0, y0, x1, y1) in zip(names, pieces):
        pad = 6
        box = (max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad))
        piece = rgba.crop(box)
        scale = min(1, max_side / max(piece.size))
        if scale < 1:
            piece = piece.resize((round(piece.width * scale), round(piece.height * scale)), Image.LANCZOS)
        piece.save(OUT / f'{name}.webp', 'WEBP', quality=88, method=6, alpha_quality=90)
        print(f'{name}: {piece.size[0]}x{piece.size[1]}')


if __name__ == '__main__':
    cut(sys.argv[1], sys.argv[2].split(','), int(sys.argv[3]) if len(sys.argv) > 3 else MAX_SIDE)
