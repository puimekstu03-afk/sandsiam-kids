"""Makes the small background-music loop, public/assets/music/songkran.m4a, from a long recording.

Every child downloads the music, so it is kept to a few minutes of mono AAC (about 1.7 MB):
it cuts START…END seconds, fades in and out so the loop restarts softly, and encodes it
with macOS's afconvert.

    python3 tools/make-music-loop.py "../รวมเพลงสงกรานต์บรรเลง แบบไทยไทย.mp3" [start] [end]

The defaults (2 → 213.4 s) end on a quiet spot of that recording. Before publishing the
site, make sure the music may be used.
"""
import array
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

START, END = 2.0, 213.4
FADE_IN, FADE_OUT = 1.5, 4.0
OUT = Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'music' / 'songkran.m4a'

source = sys.argv[1]
start = float(sys.argv[2]) if len(sys.argv) > 2 else START
end = float(sys.argv[3]) if len(sys.argv) > 3 else END

with tempfile.TemporaryDirectory() as tmp:
    full, loop = Path(tmp) / 'full.wav', Path(tmp) / 'loop.wav'
    subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', source, str(full)], check=True)
    with wave.open(str(full)) as w:
        rate = w.getframerate()
        w.setpos(int(start * rate))
        samples = array.array('h', w.readframes(int((end - start) * rate)))
    n, fade_in, fade_out = len(samples), int(FADE_IN * rate), int(FADE_OUT * rate)
    for i in range(fade_in):
        samples[i] = int(samples[i] * i / fade_in)
    for i in range(fade_out):
        samples[n - 1 - i] = int(samples[n - 1 - i] * i / fade_out)
    with wave.open(str(loop), 'wb') as o:
        o.setnchannels(1)
        o.setsampwidth(2)
        o.setframerate(rate)
        o.writeframes(samples.tobytes())
    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '64000', '-q', '127', str(loop), str(OUT)], check=True)

print('wrote', OUT, OUT.stat().st_size // 1024, 'KB')
