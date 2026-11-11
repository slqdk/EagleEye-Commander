#!/usr/bin/env python3
"""Builds the voice pack: public/audio/voices.mp3 (all lines in one file) + public/js/voiceindex.js (where each line is).

Voices are synthesised with Kokoro-82M (Apache-2.0) through kokoro-onnx, then run through a radio effect.
Needs:  pip install kokoro-onnx soundfile numpy scipy   and ffmpeg with libmp3lame.
Model:  kokoro-v1.0.onnx and voices-v1.0.bin from
        https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
Usage:  python3 tools/make_voices.py kokoro-v1.0.onnx voices-v1.0.bin
        add  --check <folder with a sherpa-onnx whisper model>  to have every line listened to by speech recognition
        (pip install sherpa-onnx; it prints the lines it heard differently).

To change a line or a voice, edit ANNOUNCER / UNITS below and run it again.
"""
import json, os, subprocess, sys
import numpy as np
import scipy.signal as sg

SR = 24000
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

# The radio operator at headquarters. key -> one or more variants (one is picked at random in the game).
ANNOUNCER = dict(voice='michael', pitch=0.95, tempo=1.1, fx='hq', lines={
    'hello':      ['Command post online. Good to have you, commander.'],
    'building':   ['Construction underway.', 'Engineers are on it.'],
    'ready':      ['Building is good to go.', 'Ready to deploy, commander.'],
    'unit':       ['Unit reporting for duty.', 'Fresh troops, ready to roll.'],
    'training':   ['Roger. Training.', 'New recruits inbound.'],
    'nomoney':    ['Negative. Not enough funds.'],
    'lowpower':   ['Warning. Power is critical.'],
    'cant':       ["Negative. Can't build there."],
    'attack':     ['Contact! Base is taking fire!', 'Commander, the base is under fire!'],
    'harv':       ['Harvester is taking fire!'],
    'lost':       ['We lost a building!'],
    'unitlost':   ['Unit down.', 'We lost one.'],
    'sold':       ['Building sold off.'],
    'repair':     ['Repairs underway.'],
    'orders':     ['Copy that. Orders confirmed.'],
    'battle':     ['All units, move out!'],
    'radar':      ['Radar is up.'],
    'won':        ['Outstanding, commander. The field is ours.'],
    'defeat':     ["We've been overrun. Fall back."],
    'eliminated': ["The base is gone, commander. We're out of the fight."],
    'newround':   ['Awaiting orders, commander.'],
    'cancel':     ['Scrubbed.'],
    'peace':      ['Ceasefire is in effect.'],
    'out':        ['Hostile commander is down.'],
})

# Every unit type answers in its own voice: s = when selected, g = when sent off.
# pitch < 1 makes the voice deeper and bigger; tempo is the final speaking speed.
UNITS = {
    'inf':  dict(voice='puck',   pitch=1.03, tempo=1.12, fx='field', s=['Rifle squad, ready.', 'Standing by, sir.', 'Give the word.'], g=['Moving out.', 'On our way.', 'Yes sir.']),
    'rkt':  dict(voice='eric',   pitch=1.00, tempo=1.08, fx='field', s=['Rocket team here.', 'Rockets loaded.', 'Pick a target.'], g=["We'll crack it open.", 'Rockets moving up.', 'On it.']),
    'gren': dict(voice='fenrir', pitch=0.88, tempo=1.05, fx='field', s=['Grenadier ready.', 'Pockets are full.', 'Say when.'], g=['Fire in the hole!', 'Going in loud.', 'With pleasure.']),
    'flm':  dict(voice='adam',   pitch=0.86, tempo=0.98, fx='field', s=['Flame unit here.', 'Tanks are full.', 'Something need burning?'], g=['Lighting it up.', 'Bringing the heat.', 'Burn it down.']),
    'jeep': dict(voice='liam',   pitch=1.08, tempo=1.15, fx='engine', s=['Recon here.', 'Engine is running.', 'Eyes open.'], g=['Rolling out fast.', 'Scouting ahead.', 'On the move.']),
    'lt':   dict(voice='echo',   pitch=1.05, tempo=1.10, fx='engine', s=['Light armor here.', 'Crew standing by.', 'Where to?'], g=['Rolling.', 'Fast and light.', 'Driver, go.']),
    'mt':   dict(voice='fenrir', pitch=0.96, tempo=1.06, fx='engine', s=['Tank commander here.', 'Armor standing by.', 'Gun is loaded.'], g=['Tracks rolling.', 'Advancing.', 'Moving to target.']),
    'art':  dict(voice='adam',   pitch=0.98, tempo=1.04, fx='field', s=['Artillery ready.', 'Gun crew here.', 'Send coordinates.'], g=['Setting up the shot.', 'Ranging now.', 'Shells on the way.']),
    'td':   dict(voice='onyx',   pitch=1.04, tempo=1.06, fx='engine', s=['Hunter ready.', 'Long gun loaded.', 'Show me armor.'], g=['Stalking the target.', 'We have the shot.', 'Moving to ambush.']),
    'jet':  dict(voice='puck',   pitch=0.97, tempo=1.10, fx='pilot', s=['Pilot here.', 'Fueled and armed.', 'Ready for takeoff.'], g=['Wheels up.', 'Target marked. Going in.', 'On my way.']),
    'ht':   dict(voice='onyx',   pitch=0.94, tempo=1.00, fx='engine', s=['Heavy armor ready.', 'Steel is waiting.', 'Point us at them.'], g=['Rolling heavy.', 'Nothing stops us.', 'Breaking through.']),
    'kat':  dict(voice='echo',   pitch=0.92, tempo=1.04, fx='engine', s=['Rocket battery here.', 'Racks are loaded.', 'Give me a grid.'], g=['Salvo coming up.', 'Moving the battery.', 'Rain on the way.']),
    'kol':  dict(voice='onyx',   pitch=0.82, tempo=0.90, fx='engine', s=['Colossus online.', 'The big gun is ready.', 'You called?'], g=['The ground will shake.', 'Moving. Slowly.', 'Out of my way.']),
    'heli': dict(voice='liam',   pitch=0.94, tempo=1.06, fx='chopper', s=['Gunship standing by.', 'Blades are spinning.', 'Ready to lift.'], g=['Lifting off.', 'Gunship inbound.', 'We own the sky.']),
}

rng = np.random.default_rng(1944)

def trim(x, thr=0.02):
    env = np.abs(x); m = env.max() or 1
    idx = np.nonzero(env > thr * m)[0]
    if not len(idx): return x
    a, b = max(0, idx[0] - int(0.012 * SR)), min(len(x), idx[-1] + int(0.03 * SR))
    y = x[a:b].copy(); f = int(0.008 * SR)
    y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    return y

def repitch(x, f):            # f > 1: higher and faster (the tempo is compensated when synthesising)
    return x if abs(f - 1) < 0.004 else sg.resample(x, int(round(len(x) / f)))

def band(x, lo, hi, order=3):
    return sg.sosfilt(sg.butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x)

def peaking(x, f0, db, q=1.2):
    a = 10 ** (db / 40); w = 2 * np.pi * f0 / SR; al = np.sin(w) / (2 * q)
    b = [1 + al * a, -2 * np.cos(w), 1 - al * a]; den = [1 + al / a, -2 * np.cos(w), 1 - al / a]
    return sg.lfilter(np.array(b) / den[0], np.array(den) / den[0], x)

def rms(x): return float(np.sqrt(np.mean(x ** 2)) + 1e-9)

FX = {  # band, drive (saturation), hiss level in dB below the voice, extra background
    'hq':      dict(lo=230, hi=4300, drive=0.42, hiss=-44, bg=None),
    'field':   dict(lo=380, hi=3400, drive=0.62, hiss=-33, bg=None),
    'engine':  dict(lo=360, hi=3000, drive=0.66, hiss=-34, bg='engine'),
    'pilot':   dict(lo=470, hi=2800, drive=0.85, hiss=-29, bg='wind'),
    'chopper': dict(lo=450, hi=2900, drive=0.8, hiss=-31, bg='rotor'),
}

def radio(x, kind):
    p = FX[kind]
    y = band(x, p['lo'], p['hi'])
    y = peaking(y, 2100, 4.0)
    y = y / rms(y)
    y = np.tanh(y * p['drive'])                    # squashes the peaks like a cheap transmitter
    y = y / rms(y)
    n = len(y); t = np.arange(n) / SR
    hiss = band(rng.standard_normal(n), 600, 3300, 2); hiss = hiss / rms(hiss) * 10 ** (p['hiss'] / 20)
    bg = np.zeros(n)
    if p['bg'] == 'engine':                        # a diesel idling somewhere behind the microphone
        f = 46 + 3 * np.sin(2 * np.pi * 0.7 * t); ph = 2 * np.pi * np.cumsum(f) / SR
        e = np.sign(np.sin(ph)) * 0.6 + np.sin(2 * ph) * 0.4 + 0.25 * rng.standard_normal(n)
        e = band(e, 90, 700, 2); bg = e / rms(e) * 10 ** (-21 / 20)
    elif p['bg'] == 'rotor':                       # blades thumping
        thump = (np.sin(2 * np.pi * 11.5 * t) > 0.72).astype(float)
        e = band(rng.standard_normal(n), 120, 900, 2) * (0.25 + sg.lfilter([0.02], [1, -0.98], thump) * 3)
        bg = e / rms(e) * 10 ** (-19 / 20)
    elif p['bg'] == 'wind':                        # cockpit roar
        e = band(rng.standard_normal(n), 250, 1500, 2) * (1 + 0.3 * np.sin(2 * np.pi * 0.9 * t))
        bg = e / rms(e) * 10 ** (-22 / 20)
    y = y + hiss + bg
    click = band(rng.standard_normal(int(0.014 * SR)), 900, 3200, 2); click = click / rms(click) * 0.5 * np.linspace(1, 0.2, len(click))
    m = int((0.085 if kind != 'hq' else 0.05) * SR)
    tail = band(rng.standard_normal(m), 700, 3300, 2); tail = tail / rms(tail) * (0.42 if kind != 'hq' else 0.22) * np.exp(-np.linspace(0, 4.5, m))
    lead = band(rng.standard_normal(int(0.05 * SR)), 600, 3300, 2); lead = lead / rms(lead) * 10 ** (p['hiss'] / 20)   # key-up, then a breath of hiss
    out = np.concatenate([click, lead, y, tail])
    out = out / rms(y) * 0.17                       # same loudness for every line
    return np.clip(out, -0.97, 0.97).astype(np.float32)

def main():
    if len(sys.argv) < 3: sys.exit(__doc__)
    from kokoro_onnx import Kokoro
    tts = Kokoro(sys.argv[1], sys.argv[2])
    asr = None
    if '--check' in sys.argv:
        import glob, sherpa_onnx
        a = sys.argv[sys.argv.index('--check') + 1]
        one = lambda pat: [f for f in glob.glob(os.path.join(a, pat)) if 'int8' not in f][0]
        asr = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=one('*encoder.onnx'), decoder=one('*decoder.onnx'), tokens=one('*tokens.txt'), num_threads=2)
    def hear(x):
        s = asr.create_stream(); s.accept_waveform(16000, sg.resample_poly(x, 2, 3).astype(np.float32)); asr.decode_stream(s); return s.result.text.strip()
    norm = lambda s: ''.join(c for c in s.lower() if c.isalnum() or c == ' ').split()

    jobs = []   # (group, key, variant, text, voice settings)
    for key, lines in ANNOUNCER['lines'].items():
        for text in lines: jobs.append(('a', key, text, ANNOUNCER))
    for unit, u in UNITS.items():
        for kind in 'sg':
            for text in u[kind]: jobs.append(('u', unit + '.' + kind, text, u))

    gap = np.zeros(int(0.16 * SR), dtype=np.float32)
    parts, index, pos, bad = [gap], {'a': {}, 'u': {}}, len(gap), 0
    def variants(text):      # the same line said slightly differently; the checker keeps the first one it hears correctly
        base = text.rstrip('.!')
        ends = [text] + [base + e for e in ('!', '.', '') if base + e != text and not text.endswith('?')]
        return [(t, k) for k in (1.0, 0.94, 1.06, 0.9) for t in ends]
    def dist(a, b):          # word-level edit distance
        d = list(range(len(b) + 1))
        for i, x in enumerate(a, 1):
            prev, d[0] = d[0], i
            for j, y in enumerate(b, 1): prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (x != y))
        return d[-1]
    for grp, key, text, v in jobs:
        best = None
        for t, k in (variants(text) if asr else [(text, 1.0)]):
            samples, sr = tts.create(t, voice='am_' + v['voice'], speed=v['tempo'] / v['pitch'] * k, lang='en-us')
            assert sr == SR
            clean = trim(np.asarray(samples, dtype=np.float32))
            if not asr: best = (0, clean, ''); break
            got = hear(clean); e = dist(norm(got), norm(text))
            if best is None or e < best[0]: best = (e, clean, got)
            if e == 0: break
        clean = best[1]
        if best[0]: bad += 1; print(f'  CHECK {key:12s} wanted "{text}"  heard "{best[2]}"')
        x = radio(repitch(clean, v['pitch']), v['fx'])
        entry = [round(pos / SR, 3), round(len(x) / SR, 3)]
        if grp == 'a': index['a'].setdefault(key, []).append(entry)
        else:
            unit, kind = key.split('.'); index['u'].setdefault(unit, {'s': [], 'g': []})[kind].append(entry)
        parts += [x, gap]; pos += len(x) + len(gap)
    sprite = np.concatenate(parts)
    wav = os.path.join(ROOT, 'dist', 'voices.wav'); os.makedirs(os.path.dirname(wav), exist_ok=True)
    import soundfile as sf
    sf.write(wav, sprite, SR, subtype='PCM_16')
    mp3 = os.path.join(ROOT, 'public', 'audio', 'voices.mp3'); os.makedirs(os.path.dirname(mp3), exist_ok=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '22050', '-c:a', 'libmp3lame', '-b:a', '32k', mp3], check=True)
    os.remove(wav)
    with open(os.path.join(ROOT, 'public', 'js', 'voiceindex.js'), 'w') as f:
        f.write('// Generated by tools/make_voices.py: where each spoken line sits in audio/voices.mp3 as [start, length] in seconds.\n')
        f.write('export const VOICE_INDEX = ' + json.dumps(index, separators=(',', ':')) + ';\n')
        import hashlib
        f.write("export const VOICE_VERSION = '" + hashlib.md5(open(mp3, 'rb').read()).hexdigest()[:8] + "';\n")
    print(f'{len(jobs)} lines, {len(sprite) / SR:.1f} s, {os.path.getsize(mp3) / 1024:.0f} KB' + (f', {bad} to check' if asr else ''))

if __name__ == '__main__':
    main()
