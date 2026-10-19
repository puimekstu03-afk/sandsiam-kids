"""Builds the claude.ai Artifact page from public/index.html.

The Artifact tool wraps the page in its own doctype/head/body skeleton, so this
keeps only the title, font and stylesheet links, and the body's content.
Run from the project folder:  python3 tools/build-artifact.py  (writes public/artifact.html)
"""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'public'
html = (root / 'index.html').read_text(encoding='utf-8')

head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body[^>]*>(.*?)</body>', html, re.S).group(1)
links = re.findall(r'\s*<link [^>]*>', head)

page = '<title>SANDSIAM ก่อเจดีย์ทราย</title>\n' + ''.join(l.strip() + '\n' for l in links) + body.strip() + '\n'
(root / 'artifact.html').write_text(page, encoding='utf-8')
print('wrote', root / 'artifact.html', len(page), 'bytes')
