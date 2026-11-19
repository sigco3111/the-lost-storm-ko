#!/usr/bin/env python3
"""Procedural audio synthesis for the-lost-storm-ko. Generates one opus per sound id."""
import json, math, os, subprocess, sys, tempfile
import numpy as np

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/the-lost-storm/public/audio/sfx'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(20261120)

def n_of(dur): return int(round(dur * SR))
def t_of(dur): return np.arange(n_of(dur)) / SR

def white(dur): return rng.standard_normal(n_of(dur))

def _shape(dur, fexp):
    n = n_of(dur)
    X = np.fft.rfft(rng.standard_normal(n))
    freqs = np.fft.rfftfreq(n, 1 / SR)
    freqs[0] = 1.0
    X *= 1.0 / (freqs ** fexp)
    x = np.fft.irfft(X, n)
    return x / (np.abs(x).max() + 1e-9)

def pink(dur): return _shape(dur, 0.5)
def brown(dur): return _shape(dur, 1.0)

def _fft_gain(x, gain_fn):
    n = len(x)
    X = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    X = X * gain_fn(freqs)
    return np.fft.irfft(X, n)

def lowpass(x, fc, soft=1.2):
    return _fft_gain(x, lambda f: 1.0 / (1.0 + (f / fc) ** (2 * soft)))

def highpass(x, fc, soft=1.2):
    return _fft_gain(x, lambda f: 1.0 / (1.0 + (fc / np.maximum(f, 1)) ** (2 * soft)))

def bandpass(x, f0, f1):
    return _fft_gain(x, lambda f: np.exp(-0.5 * ((np.log(np.maximum(f, 1) / math.sqrt(f0 * f1))) / (math.log(f1 / f0) / 2 + 1e-9)) ** 2))

def sine(freq, dur, phase=0.0):
    t = t_of(dur)
    return np.sin(2 * np.pi * freq * t + phase)

def chirp(f0, f1, dur):
    t = t_of(dur)
    k = (f1 - f0) / max(dur, 1e-6)
    return np.sin(2 * np.pi * (f0 * t + 0.5 * k * t * t))

def exp_env(dur, tau, start=1.0):
    return start * np.exp(-t_of(dur) / tau)

def adsr(dur, a, d, s_level, r):
    n = n_of(dur)
    env = np.zeros(n)
    na, nd, nr = n_of(a), n_of(d), n_of(r)
    ns = max(0, n - na - nd - nr)
    parts = []
    if na: parts.append(np.linspace(0, 1, na))
    if nd: parts.append(np.linspace(1, s_level, nd))
    if ns: parts.append(np.full(ns, s_level))
    if nr: parts.append(np.linspace(s_level, 0, nr))
    env = np.concatenate(parts)[:n]
    if len(env) < n: env = np.pad(env, (0, n - len(env)))
    return env

def fade(x, fi=0.005, fo=0.01):
    y = x.copy()
    ni, no = n_of(fi), n_of(fo)
    if ni: y[:ni] *= np.linspace(0, 1, ni)
    if no: y[-no:] *= np.linspace(1, 0, no)
    return y

def tremolo(x, rate, depth, phase=0.0):
    t = np.arange(len(x)) / SR
    return x * (1 - depth * 0.5 * (1 + np.sin(2 * np.pi * rate * t + phase)))

def echo(x, delay=0.12, taps=3, feedback=0.45):
    y = x.copy()
    d = n_of(delay)
    for i in range(1, taps + 1):
        off = d * i
        if off < len(x):
            y[off:] += x[:-off] * (feedback ** i)
    return y

def reverb(x, decay=0.35, mix=0.3, predelay=0.02):
    n = len(x)
    tail = np.exp(-np.arange(n) / (SR * decay)) * rng.standard_normal(n)
    wet = np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(tail), n)
    wet /= (np.abs(wet).max() + 1e-9)
    out = x.copy()
    pd = n_of(predelay)
    out[pd:] += wet[:-pd] * mix
    return out

def norm(x, peak=0.85):
    m = np.abs(x).max()
    return x * (peak / m) if m > 0 else x

def loopify(x, xfade=2.0):
    nx = n_of(xfade)
    if len(x) <= 2 * nx: return x
    w = np.linspace(0, 1, nx)
    out = x[:-nx].copy()
    out[:nx] = x[:nx] * w + x[-nx:] * (1 - w)
    return out

def mix(*xs):
    m = min(len(x) for x in xs)
    y = xs[0][:m].copy()
    for x in xs[1:]: y = y + x[:m]
    return y

def pmax(*xs):
    m = max(len(x) for x in xs)
    y = np.zeros(m)
    for x in xs: y[:len(x)] += x
    return y

def stereo(x):
    return np.stack([x, x], axis=1)

def save(name, x, peak=0.85, sr_out=48000):
    x = norm(np.nan_to_num(x), peak)
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    raw = tempfile.mktemp(suffix='.raw')
    pcm.tofile(raw)
    out = os.path.join(OUT, name + '.ogg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1',
                    '-i', raw, '-ar', str(sr_out), '-c:a', 'libopus', '-b:a', '72k', out], check=True)
    os.remove(raw)

# ---------- recipe helpers ----------
def wind(dur, fc=500, depth=0.5, rate=0.07, bright=0.0, loop=True):
    x = brown(dur) * 0.8 + white(dur) * 0.15
    x = lowpass(x, fc)
    x = tremolo(x, rate, depth)
    if bright: x += bandpass(white(dur), 2000, 5000) * bright * tremolo(white(dur), rate * 1.7, 0.8)
    return loopify(norm(x), min(3.0, dur / 4)) if loop else norm(x)

def air(dur, f0=800, f1=2500, level=0.4):
    x = bandpass(pink(dur), f0, f1) * level
    x = tremolo(x, 0.09, 0.35)
    return loopify(norm(x, 0.5), min(3.0, dur / 4))

def drone(dur, freqs, detune=0.4, level=0.5):
    x = np.zeros(n_of(dur))
    for f in freqs:
        x += sine(f, dur) + 0.5 * sine(f * 1.005 + detune, dur, 1.3)
    x = tremolo(lowpass(x / max(1, len(freqs)), 300), 0.05, 0.3)
    return loopify(norm(x, level), min(4.0, dur / 4))

def rain(dur, level=0.35):
    x = bandpass(white(dur), 1800, 7000) * level
    return loopify(norm(x, level), 3.0)

def fire(dur, base=0.5, pops=14):
    x = lowpass(brown(dur), 700) * base
    n = n_of(dur)
    for _ in range(pops):
        p = rng.integers(0, n - n_of(0.06))
        L = rng.uniform(0.02, 0.06)
        pop = bandpass(white(L), 900, 3200) * exp_env(L, 0.012) * rng.uniform(0.3, 0.9)
        x[p:p + n_of(L)] += pop[:max(0, min(len(pop), n - p))]
    x = tremolo(x, 3.1, 0.15)
    return loopify(norm(x), 1.0)

def rumble(dur, fc=90, level=0.8, swell=None):
    x = lowpass(brown(dur), fc)
    if swell:
        t = t_of(dur)
        x *= np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return norm(x, level)

def boom(dur=1.2, f0=85, f1=38, tau=0.35, level=0.95):
    x = chirp(f0, f1, dur) * exp_env(dur, tau)
    x += lowpass(white(dur), 150) * exp_env(dur, tau * 0.6) * 0.6
    return norm(x, level)

def crack(dur=0.5, f0=1800, f1=6000, tau=0.06):
    return norm(bandpass(white(dur), f0, f1) * exp_env(dur, tau), 0.9)

def whoosh(dur, f_lo=300, f_hi=1800, a=0.25, level=0.8):
    x = pink(dur)
    n = len(x)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    tt = np.linspace(0, 1, n)
    centre = f_lo * (f_hi / f_lo) ** np.sin(np.pi * tt)  # sweep up then down
    X = np.fft.rfft(x)
    # apply time-varying bandpass in frames
    out = np.zeros(n)
    frame = 2048
    hop = 1024
    win = np.hanning(frame)
    for st in range(0, n - frame, hop):
        seg = x[st:st + frame] * win
        S = np.fft.rfft(seg)
        fr = np.fft.rfftfreq(frame, 1 / SR)
        c = centre[st]
        g = np.exp(-0.5 * (np.log(np.maximum(fr, 1) / c) / 0.55) ** 2)
        out[st:st + frame] += np.fft.irfft(S * g, frame) * win
    env = adsr(dur, a, dur * 0.3, 0.5, dur * 0.45)
    return norm(out * env, level)

def thump(dur=0.22, f0=90, tau=0.07, level=0.9, noise_level=0.5, nfc=500):
    x = chirp(f0, f0 * 0.5, dur) * exp_env(dur, tau) * 1.2
    x += lowpass(white(dur), nfc) * exp_env(dur, tau * 0.7) * noise_level
    return norm(x, level)

def click(dur=0.05, f0=2000, f1=6000, level=0.7, tau=0.012):
    return norm(bandpass(white(dur), f0, f1) * exp_env(dur, tau), level)

def ping(freq, dur, tau=None, level=0.7, harmonics=3, detune=0.003):
    tau = tau or dur / 3
    x = np.zeros(n_of(dur))
    for h in range(1, harmonics + 1):
        x += sine(freq * h * (1 + detune * h), dur) / (h ** 1.5)
    x *= exp_env(dur, tau)
    return norm(x, level)

def zap(dur=0.18, f0=1600, f1=300, level=0.8):
    x = chirp(f0, f1, dur) * exp_env(dur, dur / 4)
    x += bandpass(white(dur), 2500, 8000) * exp_env(dur, dur / 8) * 0.5
    return norm(x, level)

def growl(dur, f0=90, rough=28, level=0.8, f1=None):
    t = t_of(dur)
    f1 = f1 or f0
    car = np.sin(2 * np.pi * (f0 * (f1 / f0) ** (t / dur)) * t)
    am = 0.5 + 0.5 * np.sin(2 * np.pi * rough * t)
    x = np.tanh(car * am * 3.0) * adsr(dur, 0.06, 0.1, 0.7, dur * 0.4)
    x += lowpass(brown(dur), 200) * 0.3
    return norm(lowpass(x, 900), level)

def hiss(dur, f0=3000, f1=7000, tau=None, level=0.7):
    x = bandpass(white(dur), f0, f1) * exp_env(dur, tau or dur / 2.5)
    return norm(x, level)

def chirps(seq, level=0.7):
    """seq of (f0,f1,dur,gap)"""
    parts = []
    for f0, f1, dur, gap in seq:
        parts.append(chirp(f0, f1, dur) * exp_env(dur, dur / 3))
        if gap: parts.append(np.zeros(n_of(gap)))
    return norm(np.concatenate(parts), level)

def gurgle(dur, blobs=6, f_lo=120, f_hi=400, level=0.75):
    x = lowpass(brown(dur), 250) * 0.4
    n = n_of(dur)
    for _ in range(blobs):
        L = min(rng.uniform(0.05, 0.18), dur * 0.45)
        f = rng.uniform(f_lo, f_hi)
        blip = chirp(f, f * rng.uniform(0.4, 0.7), L) * adsr(L, 0.02, 0.05, 0.4, L * 0.5)
        p = rng.integers(0, max(1, n - n_of(L)))
        x[p:p + n_of(L)] += blip * rng.uniform(0.5, 1.0)
    return norm(x, level)

def rattle(dur, hits=5, f0=2500, f1=5000, level=0.75):
    n = n_of(dur)
    x = np.zeros(n)
    for i in range(hits):
        p = max(0, int(i * n / hits + rng.uniform(-0.02, 0.02) * SR))
        L = 0.05
        seg = bandpass(white(L), f0, f1) * exp_env(L, 0.015) * rng.uniform(0.5, 1)
        if p + n_of(L) < n: x[p:p + n_of(L)] += seg
    return norm(x, level)

def chime(freqs, dur, gap=0.0, tau=None, level=0.7):
    parts = []
    for f in freqs:
        parts.append(ping(f, dur, tau=tau, level=1, harmonics=4))
        if gap: parts.append(np.zeros(n_of(gap)))
    x = np.concatenate(parts) if len(parts) > 1 else parts[0]
    return norm(reverb(x, 0.5, 0.25), level)

def pad(freqs, dur=14.0, level=0.7):
    x = np.zeros(n_of(dur))
    for f in freqs:
        x += sine(f, dur, rng.uniform(0, 6)) * 0.6 + sine(f * 1.004, dur, rng.uniform(0, 6)) * 0.4 + sine(f * 2.003, dur) * 0.12
    x = lowpass(x, 900)
    x *= adsr(dur, dur * 0.3, dur * 0.2, 0.8, dur * 0.35)
    x = tremolo(x, 0.11, 0.18)
    x = reverb(x, 0.9, 0.4)
    return loopify(norm(x, level), 3.0)

def rustle(dur, level=0.6, f0=700, f1=3000):
    x = bandpass(white(dur), f0, f1)
    x *= adsr(dur, 0.02, 0.08, 0.5, dur * 0.6)
    return norm(tremolo(x, 18, 0.6), level)

def sweep_tone(f0, f1, dur, level=0.7, tau=None):
    x = chirp(f0, f1, dur) * exp_env(dur, tau or dur / 2)
    return norm(reverb(x, 0.4, 0.3), level)

def drip(dur=0.7, level=0.65):
    x = ping(rng.uniform(1800, 2600), dur, tau=0.08, harmonics=2)
    return norm(echo(x, 0.14, 3, 0.5), level)

def creak(dur=0.8, f0=140, level=0.7):
    t = t_of(dur)
    x = chirp(f0, f0 * 0.6, dur)
    x = np.tanh(x * 2.5) * tremolo(np.ones(len(t)), 7, 0.7)
    x *= adsr(dur, 0.1, 0.2, 0.6, dur * 0.5)
    return norm(lowpass(x, 800), level)

def breath(dur, dark=True, level=0.6):
    x = bandpass(pink(dur), 300 if dark else 500, 1200 if dark else 2500)
    x *= adsr(dur, dur * 0.35, dur * 0.2, 0.5, dur * 0.45)
    return norm(x, level)

# ---------- id recipes ----------
def build():
    R = {}

    # --- ambience loops ---
    for i, (fc, depth, rate, lv) in {
        'ambience_mist_wind': (450, 0.55, 0.06, 0.8), 'ambience_hall_wind': (550, 0.5, 0.08, 0.8),
        'ambience_wind_cave': (350, 0.6, 0.05, 0.75), 'ambience_wind_fort': (600, 0.45, 0.09, 0.75),
        'ambience_wind_hollow': (400, 0.65, 0.055, 0.75), 'ambience_wind_low': (280, 0.5, 0.045, 0.7),
        'ambience_lobby_wind': (500, 0.5, 0.07, 0.7),
    }.items():
        R[i] = lambda fc=fc, depth=depth, rate=rate, lv=lv: wind(20, fc, depth, rate) * lv
    R['ambience_wind_storm'] = lambda: norm(mix(wind(20, 650, 0.6, 0.09), rain(20, 0.25)), 0.85)
    R['ambience_hall_storm'] = lambda: norm(mix(wind(22, 600, 0.6, 0.08), rain(22, 0.3)), 0.85)
    R['ambience_hideout_storm'] = lambda: norm(mix(wind(22, 500, 0.5, 0.07) * 0.7, rain(22, 0.15)), 0.7)
    R['ambience_hall_air'] = lambda: air(20, 700, 2400)
    R['ambience_hall_1'] = lambda: norm(mix(air(22, 500, 1800, 0.35), drone(22, [55, 82.4], level=0.25)), 0.6)
    R['ambience_mist_air'] = lambda: air(20, 900, 2600, 0.35)
    R['ambience_cave_air'] = lambda: air(20, 300, 1200, 0.4)
    R['ambience_cave_room'] = lambda: norm(mix(drone(20, [49, 73.4], level=0.3), air(20, 200, 700, 0.3)), 0.55)
    R['ambience_cave_rumble'] = lambda: loopify(rumble(20, 70, 0.5), 3.0)
    R['ambience_cave_drips'] = lambda: _loop_drips(20, 5)
    R['ambience_cave_drip_bed'] = lambda: _loop_drips(20, 9)
    R['ambience_mist_drone'] = lambda: drone(22, [55, 110, 164.8], level=0.45)
    R['ambience_drone_dark'] = lambda: drone(22, [41.2, 61.7], level=0.5)
    R['ambience_drone_low'] = lambda: drone(22, [36.7, 55], level=0.5)
    R['ambience_lobby_drone'] = lambda: drone(22, [55, 82.4, 110], level=0.4)
    R['ambience_fire'] = lambda: fire(16, 0.5, 16)
    R['ambience_torch_fire'] = lambda: fire(14, 0.4, 10)
    R['ambience_hideout_fire'] = lambda: fire(18, 0.55, 18)
    R['ambience_lava_bed'] = lambda: loopify(norm(mix(lowpass(brown(18), 160) * 0.7, gurgle(18, 22, 60, 160) * 0.6)), 3.0)
    R['ambience_lava_flow'] = lambda: loopify(norm(mix(lowpass(brown(18), 220) * 0.8, gurgle(18, 10, 80, 200) * 0.4)), 3.0)
    R['ambience_lava_heat'] = lambda: loopify(norm(mix(bandpass(white(18), 2500, 6000) * 0.12, lowpass(brown(18), 120) * 0.7)), 0.7)
    R['ambience_reeds'] = lambda: norm(mix(wind(20, 700, 0.5, 0.1) * 0.6, bandpass(tremolo(white(20), 2.3, 0.8), 1500, 4500) * 0.12), 0.6)
    R['ambience_shore'] = lambda: _shore(22)
    R['ambience_mist_gust'] = lambda: wind(7, 700, 0.8, 0.25, 0, False) * adsr(7, 1.5, 2, 0.5, 3)

    # --- thunder / storm stingers ---
    R['thunder_far'] = lambda: rumble(7, 80, 0.7, swell=True)
    R['thunder_distant'] = lambda: rumble(6, 90, 0.6, swell=True)
    R['thunder_rumble'] = lambda: rumble(5, 85, 0.65, swell=True)
    R['storm_rumble'] = lambda: rumble(4.5, 100, 0.6, swell=True)
    R['thunder_close'] = lambda: norm(pmax(boom(2.2, 70, 30, 0.5), rumble(5, 90, 0.5, swell=True), crack(0.3, 900, 3000, 0.05) * 0.7), 0.95)
    R['thunder_close_sharp'] = lambda: norm(pmax(crack(0.25, 1500, 5000, 0.04), boom(1.6, 80, 34, 0.4)), 0.95)
    R['thunder_crack'] = lambda: norm(pmax(crack(0.35, 1200, 4500, 0.06), rumble(3, 100, 0.4, swell=True)), 0.9)
    R['storm_crackle'] = lambda: _crackle(1.2)
    R['electric_crackle'] = lambda: _crackle(0.5)
    R['storm_snap'] = lambda: norm(pmax(crack(0.12, 2500, 8000, 0.02), zap(0.12, 2200, 500)), 0.85)
    R['storm_hum'] = lambda: drone(6, [60, 120, 180], level=0.45)
    R['storm_fade'] = lambda: norm(wind(4, 500, 0.7, 0.3, 0, False) * exp_env(4, 1.2), 0.6)
    R['spark_tick'] = lambda: click(0.03, 3500, 8000, 0.4)
    R['spark_snap'] = lambda: norm(pmax(crack(0.08, 3000, 9000, 0.015), ping(2800, 0.1, tau=0.02, level=0.3)), 0.7)

    # --- music pads ---
    R['music_pad_am'] = lambda: pad([110, 130.81, 164.81, 220])
    R['music_pad_c'] = lambda: pad([130.81, 164.81, 196, 261.63])
    R['music_pad_em'] = lambda: pad([82.41, 98, 123.47, 164.81])
    R['music_pad_f'] = lambda: pad([87.31, 110, 130.81, 174.61])
    R['music_pad_fmaj7'] = lambda: pad([87.31, 110, 130.81, 164.81])
    R['music_pad_g'] = lambda: pad([98, 123.47, 146.83, 196])
    R['music_pad_high'] = lambda: pad([440, 523.25, 659.25], dur=12, level=0.4)

    # --- footsteps ---
    R['footstep_stone'] = lambda: thump(0.1, 130, 0.03, 0.7, 0.6, 1400)
    R['footstep_gravel'] = lambda: norm(pmax(thump(0.11, 120, 0.03, 0.6), rattle(0.12, 3, 1500, 4000, 0.3)), 0.65)
    R['footstep_dirt'] = lambda: thump(0.12, 100, 0.045, 0.6, 0.5, 700)
    R['footstep_grass'] = lambda: rustle(0.14, 0.5)
    R['footstep_mud'] = lambda: norm(pmax(thump(0.14, 75, 0.06, 0.6, 0.4, 300), gurgle(0.1, 1, 100, 200, 0.4)), 0.6)
    R['footstep_wood'] = lambda: norm(pmax(thump(0.09, 160, 0.025, 0.7, 0.3, 900), ping(420, 0.06, tau=0.02, level=0.2)), 0.7)
    R['footstep_water'] = lambda: norm(pmax(gurgle(0.16, 2, 200, 600, 0.5), bandpass(white(0.12), 900, 3000) * exp_env(0.12, 0.03) * 0.5), 0.6)
    R['footstep_wade'] = lambda: norm(pmax(gurgle(0.25, 3, 150, 500, 0.6), hiss(0.2, 1000, 3000, 0.06, 0.3)), 0.6)
    R['step_ash'] = lambda: norm(thump(0.1, 95, 0.04, 0.5, 0.5, 500), 0.55)
    R['dodge_land'] = lambda: thump(0.16, 100, 0.05, 0.8, 0.6, 900)
    R['rank_step'] = lambda: thump(0.14, 110, 0.045, 0.8, 0.5, 1100)

    # --- combat whooshes / swings ---
    R['dodge_whoosh'] = lambda: whoosh(0.3, 500, 2400, 0.15)
    R['heavy_whoosh'] = lambda: whoosh(0.5, 200, 900, 0.3, 0.9)
    R['millwheel_whoosh'] = lambda: whoosh(0.45, 600, 2600, 0.1, 0.8)
    R['wisp_whoosh'] = lambda: whoosh(0.35, 900, 3200, 0.1, 0.6)
    R['bolt_whoosh'] = lambda: whoosh(0.28, 800, 3000, 0.08, 0.75)
    R['bolt_flight'] = lambda: whoosh(0.45, 1200, 3500, 0.05, 0.55)
    R['sword_swing_light'] = lambda: whoosh(0.22, 900, 3800, 0.06, 0.8)
    R['sword_swing_heavy'] = lambda: whoosh(0.35, 400, 2000, 0.12, 0.9)
    R['sword_slash'] = lambda: norm(pmax(whoosh(0.2, 1000, 4000, 0.05, 0.8), crack(0.06, 3000, 8000, 0.01) * 0.4), 0.85)
    R['swing_blunt'] = lambda: whoosh(0.3, 300, 1400, 0.1, 0.85)
    R['crossbow_shot'] = lambda: norm(pmax(click(0.04, 1500, 4000, 0.8), ping(220, 0.15, tau=0.03, harmonics=5, level=0.6), whoosh(0.15, 1500, 4000, 0.03, 0.4)), 0.85)
    R['crossbow_heavy'] = lambda: norm(pmax(click(0.05, 1200, 3500, 0.9), ping(160, 0.2, tau=0.05, harmonics=5, level=0.7), whoosh(0.2, 1200, 3200, 0.05, 0.5)), 0.9)

    # --- zaps / storm magic ---
    R['bolt_zap'] = lambda: norm(pmax(zap(0.16, 1800, 250), _crackle(0.12) * 0.5), 0.85)
    R['bolt_impact'] = lambda: norm(pmax(zap(0.14, 1200, 200), thump(0.12, 150, 0.03, 0.6)), 0.85)
    R['storm_bolt_cast'] = lambda: norm(pmax(zap(0.25, 500, 2200, 0.7), _crackle(0.2) * 0.4), 0.8)
    R['storm_bolt_hit'] = lambda: norm(pmax(zap(0.2, 2000, 250), boom(0.4, 90, 45, 0.15, 0.6)), 0.9)
    R['spell_flick'] = lambda: norm(pmax(zap(0.1, 1500, 700, 0.5), ping(1900, 0.08, tau=0.02, level=0.3)), 0.7)

    # --- hits ---
    R['hit_flesh'] = lambda: thump(0.16, 110, 0.05, 0.85, 0.7, 600)
    R['hit_shell'] = lambda: norm(pmax(click(0.05, 1200, 4000, 0.8), thump(0.1, 200, 0.03, 0.5)), 0.8)
    R['hit_shell_crit'] = lambda: norm(pmax(click(0.06, 1600, 5000, 0.9), ping(900, 0.15, tau=0.04, level=0.5), thump(0.1, 180, 0.03, 0.6)), 0.9)
    R['hit_shield'] = lambda: norm(pmax(click(0.05, 900, 3000, 0.7), ping(500, 0.12, tau=0.04, harmonics=4, level=0.5)), 0.8)
    R['hit_wood'] = lambda: norm(pmax(click(0.05, 700, 2200, 0.7), thump(0.08, 180, 0.02, 0.4)), 0.7)
    R['crit_hit'] = lambda: norm(pmax(crack(0.1, 2000, 6000, 0.02), thump(0.18, 130, 0.05, 0.9), ping(1200, 0.2, tau=0.05, level=0.5)), 0.95)
    R['bone_hit'] = lambda: norm(pmax(click(0.05, 1800, 4500, 0.8), rattle(0.15, 2, 2000, 4500, 0.4)), 0.8)
    R['bones_rattle'] = lambda: rattle(0.5, 7, 1800, 4500)
    R['bones_collapse'] = lambda: norm(pmax(rattle(0.7, 10, 1500, 4000, 0.7), thump(0.3, 90, 0.1, 0.6, 0.4, 400)), 0.8)
    R['body_fall'] = lambda: norm(pmax(thump(0.35, 80, 0.12, 0.85, 0.6, 400), rustle(0.3, 0.3)), 0.85)
    R['slam_heavy'] = lambda: norm(pmax(boom(0.7, 75, 35, 0.25), crack(0.1, 800, 2500, 0.03) * 0.6), 0.95)
    R['ground_boom'] = lambda: boom(0.9, 65, 30, 0.35, 0.95)
    R['rock_slam'] = lambda: norm(pmax(thump(0.4, 70, 0.12, 0.9, 0.8, 500), rattle(0.3, 3, 900, 2500, 0.4)), 0.9)
    R['rock_settle'] = lambda: norm(pmax(rattle(0.6, 4, 700, 2000, 0.5), thump(0.2, 70, 0.08, 0.4, 0.3, 250)), 0.6)

    # --- creatures ---
    R['growl_hound'] = lambda: growl(0.6, 110, 30)
    R['growl_brute'] = lambda: growl(0.9, 70, 22, 0.9)
    R['growl_airy'] = lambda: norm(pmax(growl(0.7, 90, 26, 0.5), breath(0.7)), 0.6)
    R['wolf_snarl'] = lambda: norm(pmax(growl(0.55, 130, 35, 0.8), hiss(0.3, 2000, 5000, 0.1, 0.3)), 0.8)
    R['wolf_death'] = lambda: norm(pmax(growl(0.7, 120, 30, 0.7, 55), R['body_fall']() * 0.5), 0.8)
    R['hound_yelp'] = lambda: chirps([(900, 1500, 0.08, 0.03), (1200, 700, 0.12, 0)], 0.7)
    R['rat_squeal'] = lambda: chirps([(1800, 2600, 0.07, 0.03), (2400, 1600, 0.08, 0)], 0.55)
    R['bat_flutter'] = lambda: norm(tremolo(bandpass(white(0.5), 800, 2500), 16, 0.9) * adsr(0.5, 0.05, 0.1, 0.7, 0.25), 0.6)
    R['bat_squeak'] = lambda: chirps([(3200, 4800, 0.06, 0.04), (4200, 3000, 0.07, 0)], 0.5)
    R['brood_screech'] = lambda: norm(pmax(chirp(1400, 450, 0.6) * tremolo(np.ones(n_of(0.6)), 9, 0.5) * adsr(0.6, 0.05, 0.1, 0.7, 0.3), hiss(0.5, 1500, 4000, 0.2, 0.3)), 0.8)
    R['brood_death'] = lambda: norm(pmax(chirp(1100, 200, 0.9) * tremolo(np.ones(n_of(0.9)), 8, 0.6) * exp_env(0.9, 0.3), thump(0.4, 70, 0.12, 0.6)), 0.85)
    R['spider_hiss'] = lambda: hiss(0.45, 3500, 7500, 0.15, 0.6)
    R['spider_death'] = lambda: norm(pmax(hiss(0.5, 2500, 6000, 0.2, 0.5), chirp(800, 250, 0.3) * exp_env(0.3, 0.1) * 0.5), 0.7)
    R['crow_call'] = lambda: norm(np.tanh(chirp(900, 500, 0.25) * 2) * tremolo(np.ones(n_of(0.25)), 30, 0.8) * exp_env(0.25, 0.09), 0.6)
    R['shade_breath'] = lambda: breath(0.8, True, 0.5)
    R['shade_hush'] = lambda: norm(bandpass(pink(0.9), 400, 1500) * adsr(0.9, 0.3, 0.2, 0.5, 0.4), 0.5)
    R['shade_death'] = lambda: norm(pmax(chirp(500, 120, 0.8) * exp_env(0.8, 0.3) * 0.4, breath(0.9, True, 0.5)), 0.6)
    R['unfinished_breath'] = lambda: breath(1.0, True, 0.55)
    R['unfinished_growl'] = lambda: growl(0.8, 65, 18, 0.85)
    R['unfinished_snarl'] = lambda: norm(pmax(growl(0.5, 95, 30, 0.8), hiss(0.3, 1800, 4000, 0.08, 0.3)), 0.8)
    R['unfinished_death'] = lambda: norm(pmax(growl(1.1, 80, 20, 0.7, 40), thump(0.5, 60, 0.2, 0.6)), 0.85)
    R['unfinished_tell'] = lambda: norm(pmax(ping(320, 0.5, tau=0.12, harmonics=2, level=0.5), breath(0.5, True, 0.4)), 0.6)
    R['masked_voice'] = lambda: norm(pmax(growl(0.7, 150, 45, 0.5), ping(700, 0.4, tau=0.1, level=0.2, harmonics=2)), 0.55)
    R['ghost_horn'] = lambda: norm(pmax((sine(110, 1.6) + sine(164.8, 1.6, 1) * 0.6 + sine(220, 1.6, 2) * 0.3) * adsr(1.6, 0.4, 0.3, 0.7, 0.6), breath(1.6, True, 0.15)), 0.75)
    R['breath_whisper'] = lambda: breath(0.7, False, 0.4)
    R['heavy_breath'] = lambda: breath(0.9, True, 0.65)

    # --- water / lava ---
    R['bubble_calm'] = lambda: gurgle(0.5, 3, 200, 500, 0.5)
    R['bubble_hostile'] = lambda: gurgle(0.5, 5, 150, 450, 0.65)
    R['lava_bubble'] = lambda: gurgle(0.35, 2, 120, 300, 0.6)
    R['lava_glop'] = lambda: gurgle(0.3, 2, 80, 220, 0.7)
    R['lava_boil'] = lambda: norm(pmax(gurgle(1.2, 12, 100, 300, 0.6), lowpass(brown(1.2), 150) * 0.5), 0.7)
    R['lava_erupt'] = lambda: norm(pmax(boom(1.0, 60, 28, 0.3, 0.8), gurgle(0.8, 8, 80, 250, 0.6)), 0.9)
    R['ooze_death'] = lambda: norm(pmax(gurgle(0.6, 5, 100, 350, 0.7), thump(0.3, 70, 0.1, 0.5)), 0.75)
    R['spit_launch'] = lambda: norm(bandpass(chirp(500, 1600, 0.12) * exp_env(0.12, 0.04) * 0.5 + white(0.12) * exp_env(0.12, 0.03), 400, 2500), 0.6)
    R['spit_land'] = lambda: norm(pmax(gurgle(0.2, 2, 150, 400, 0.6), thump(0.12, 120, 0.04, 0.5, 0.6, 900)), 0.65)
    R['water_cast'] = lambda: norm(pmax(whoosh(0.4, 600, 2200, 0.1, 0.6), gurgle(0.3, 3, 300, 700, 0.4)), 0.7)
    R['water_sweep'] = lambda: norm(pmax(whoosh(0.45, 500, 2000, 0.15, 0.6), bandpass(white(0.3), 1000, 3500) * exp_env(0.3, 0.1) * 0.3), 0.7)
    R['water_surge'] = lambda: norm(pmax(whoosh(0.8, 300, 1400, 0.3, 0.8), gurgle(0.6, 5, 150, 500, 0.5)), 0.8)
    R['water_swell'] = lambda: norm(pmax(wind(2.5, 800, 0.7, 0.4, 0, False) * adsr(2.5, 0.8, 0.5, 0.5, 1.2) * 0.7, gurgle(2.0, 6, 150, 450, 0.4)), 0.7)
    R['water_crash'] = lambda: norm(pmax(bandpass(white(0.7), 700, 4000) * exp_env(0.7, 0.18) * 0.9, gurgle(0.5, 5, 200, 600, 0.5)), 0.85)
    R['water_crash_heavy'] = lambda: norm(pmax(R['water_crash'](), thump(0.4, 70, 0.12, 0.7)), 0.9)
    R['water_douse'] = lambda: norm(pmax(bandpass(white(0.5), 1200, 5000) * exp_env(0.5, 0.12) * 0.8, gurgle(0.4, 4, 200, 550, 0.5)), 0.75)
    R['water_splash'] = lambda: norm(pmax(bandpass(white(0.4), 900, 4000) * exp_env(0.4, 0.1) * 0.8, gurgle(0.3, 3, 250, 600, 0.5)), 0.75)
    R['water_lap'] = lambda: norm(pmax(gurgle(0.5, 3, 200, 500, 0.45), bandpass(white(0.4), 800, 2500) * exp_env(0.4, 0.15) * 0.25), 0.5)
    R['water_settle'] = lambda: norm(gurgle(0.7, 4, 150, 400, 0.4) * exp_env(0.7, 0.3), 0.5)
    R['wave_arrival'] = lambda: norm(pmax(wind(3.5, 700, 0.8, 0.3, 0, False) * adsr(3.5, 1.2, 0.8, 0.5, 1.5), rumble(3.5, 90, 0.5, swell=True)), 0.9)

    # --- fire ---
    R['fire_blast'] = lambda: norm(pmax(bandpass(white(0.5), 400, 2500) * exp_env(0.5, 0.12), boom(0.4, 90, 45, 0.12, 0.6)), 0.9)
    R['fire_ignite'] = lambda: norm(pmax(bandpass(white(0.4), 800, 3500) * adsr(0.4, 0.06, 0.1, 0.6, 0.25), hiss(0.3, 2000, 5000, 0.1, 0.3)), 0.7)
    R['fire_extinguish'] = lambda: hiss(0.6, 1500, 5000, 0.25, 0.6)
    R['burn_sizzle'] = lambda: norm(bandpass(white(0.8), 3500, 8500) * tremolo(np.ones(n_of(0.8)), 23, 0.5) * exp_env(0.8, 0.35), 0.5)
    R['ember_bed'] = lambda: fire(3, 0.3, 3)
    R['flare_crackle'] = lambda: norm(fire(0.8, 0.4, 5) * exp_env(0.8, 0.3), 0.65)

    # --- ui / items ---
    R['ui_tap'] = lambda: click(0.04, 1800, 4000, 0.5)
    R['ui_click'] = lambda: click(0.04, 1600, 3800, 0.5)
    R['ui_panel'] = lambda: norm(pmax(click(0.05, 1200, 3000, 0.5), rustle(0.08, 0.2)), 0.55)
    R['ui_error'] = lambda: chirps([(220, 180, 0.09, 0.03), (180, 140, 0.12, 0)], 0.5)
    R['ui_skill_point'] = lambda: norm(pmax(ping(880, 0.3, tau=0.08, level=0.5), ping(1320, 0.35, tau=0.1, level=0.4)), 0.6)
    R['level_up'] = lambda: chime([523.25, 659.25, 784], 0.9, gap=0.07, level=0.7)
    R['quest_update'] = lambda: chime([659.25, 880], 0.7, gap=0.06, level=0.6)
    R['item_identified'] = lambda: chime([784, 1046.5], 0.8, gap=0.08, level=0.6)
    R['bell_chime'] = lambda: ping(880, 1.6, tau=0.5, level=0.6, harmonics=5)
    R['shimmer_faint'] = lambda: norm(pmax(ping(1567, 0.9, tau=0.25, level=0.35, harmonics=3), ping(2093, 0.7, tau=0.2, level=0.2)), 0.4)
    R['coin_drop'] = lambda: chirps([(2900, 2500, 0.05, 0.04), (3400, 2900, 0.07, 0)], 0.5)
    R['coin_pickup'] = lambda: chirps([(2400, 3000, 0.05, 0.03), (3200, 3600, 0.06, 0)], 0.5)
    R['metal_jingle'] = lambda: rattle(0.4, 5, 3000, 7000, 0.4)
    R['item_metal'] = lambda: norm(pmax(ping(1400, 0.25, tau=0.05, level=0.4, harmonics=5), click(0.05, 1500, 4000, 0.5)), 0.6)
    R['equip_cloth'] = lambda: rustle(0.25, 0.55)
    R['leather_move'] = lambda: rustle(0.3, 0.5, 400, 1800)
    R['cloth_rustle'] = lambda: rustle(0.25, 0.45)
    R['item_drop_common'] = lambda: thump(0.12, 140, 0.04, 0.5, 0.4, 1200)
    R['item_drop_magic'] = lambda: norm(pmax(ping(1174, 0.4, tau=0.12, level=0.4), thump(0.12, 140, 0.04, 0.4)), 0.55)
    R['item_drop_rare'] = lambda: norm(pmax(ping(880, 0.5, tau=0.15, level=0.45), ping(1318, 0.5, tau=0.15, level=0.35)), 0.6)
    R['item_drop_stormtouched'] = lambda: norm(pmax(ping(740, 0.6, tau=0.18, level=0.45), _crackle(0.3) * 0.4), 0.65)
    R['flask_drink'] = lambda: norm(gurgle(0.6, 4, 300, 800, 0.5), 0.6)
    R['potion_drink'] = lambda: norm(gurgle(0.6, 4, 300, 800, 0.5), 0.6)
    R['potion_uncork'] = lambda: norm(pmax(click(0.05, 900, 2500, 0.5), gurgle(0.1, 1, 400, 800, 0.3)), 0.55)
    R['glass_clink'] = lambda: ping(2200, 0.3, tau=0.06, level=0.45, harmonics=4)
    R['page_turn'] = lambda: rustle(0.3, 0.4, 1500, 6000)
    R['book_open'] = lambda: norm(pmax(rustle(0.4, 0.4, 1200, 5000), thump(0.15, 150, 0.05, 0.3, 0.2, 500)), 0.5)
    R['tally_scratch'] = lambda: norm(tremolo(bandpass(white(0.3), 2000, 5000), 35, 0.85) * exp_env(0.3, 0.12), 0.5)
    R['tally_due'] = lambda: chime([440, 440], 0.5, gap=0.12, level=0.5)
    R['chain_rattle'] = lambda: norm(pmax(rattle(0.5, 6, 2500, 6000, 0.5), ping(900, 0.3, tau=0.08, level=0.25, harmonics=5)), 0.6)
    R['chest_open'] = lambda: norm(pmax(creak(0.5, 160, 0.5), ping(600, 0.2, tau=0.06, level=0.2)), 0.6)
    R['chest_close'] = lambda: norm(pmax(thump(0.18, 120, 0.05, 0.7, 0.4, 800), ping(500, 0.12, tau=0.03, level=0.2)), 0.7)
    R['door_wood'] = lambda: creak(0.7, 130, 0.65)
    R['door_stone'] = lambda: norm(lowpass(tremolo(brown(0.9), 6, 0.5), 300) * adsr(0.9, 0.15, 0.2, 0.7, 0.4), 0.7)
    R['door_metal'] = lambda: norm(pmax(creak(0.6, 220, 0.5), ping(800, 0.4, tau=0.12, level=0.25, harmonics=5)), 0.6)
    R['clock_tick'] = lambda: click(0.04, 1400, 3200, 0.5, 0.008)
    R['clock_tick_great'] = lambda: click(0.05, 1000, 2600, 0.6, 0.01)
    R['clock_tick_loop'] = lambda: loopify(norm(np.concatenate([click(0.04, 1400, 3200, 0.5, 0.008), np.zeros(n_of(0.46))])), 0.1)
    R['clock_strike'] = lambda: norm(pmax(ping(220, 2.2, tau=0.7, level=0.7, harmonics=6, detune=0.004), click(0.05, 1000, 3000, 0.5)), 0.75)
    R['mender_thread'] = lambda: norm(pmax(sweep_tone(900, 1800, 0.5, 0.35), bandpass(white(0.4), 2500, 6000) * exp_env(0.4, 0.15) * 0.15), 0.45)
    R['custodian_raise'] = lambda: norm(pmax(sweep_tone(200, 600, 0.9, 0.5), rumble(0.9, 100, 0.3, swell=True)), 0.65)
    R['monsters_rising'] = lambda: norm(pmax(rumble(1.6, 120, 0.6, swell=True), growl(1.2, 70, 20, 0.4)), 0.75)
    R['portal_open'] = lambda: norm(pmax(whoosh(1.0, 300, 2400, 0.4, 0.6), sweep_tone(300, 900, 1.0, 0.3)), 0.7)
    R['portal_travel'] = lambda: norm(pmax(whoosh(0.9, 2000, 300, 0.3, 0.7), sweep_tone(1200, 300, 0.8, 0.35)), 0.75)
    R['waypoint_attune'] = lambda: chime([523.25, 784, 1046.5], 1.2, gap=0.05, level=0.6)
    R['hex_charge'] = lambda: norm(pmax(sweep_tone(300, 1200, 0.6, 0.45), _crackle(0.4) * 0.3), 0.6)
    R['hex_orb_launch'] = lambda: norm(pmax(sweep_tone(800, 300, 0.35, 0.5), whoosh(0.3, 700, 2000, 0.1, 0.5)), 0.65)
    R['hex_impact'] = lambda: norm(pmax(ping(1100, 0.3, tau=0.06, level=0.5), zap(0.15, 1300, 350, 0.5)), 0.7)
    R['shadow_cast'] = lambda: norm(pmax(whoosh(0.6, 200, 900, 0.25, 0.6), breath(0.6, True, 0.3)), 0.65)
    R['brand_mark'] = lambda: norm(pmax(hiss(0.5, 2500, 6000, 0.2, 0.4), ping(1500, 0.4, tau=0.1, level=0.3)), 0.55)
    R['brand_burst'] = lambda: norm(pmax(hiss(0.6, 2000, 5500, 0.25, 0.5), boom(0.5, 80, 40, 0.15, 0.6)), 0.75)
    R['squall_rise'] = lambda: norm(wind(2.5, 800, 0.85, 0.5, 0, False) * adsr(2.5, 1.0, 0.5, 0.5, 1.0), 0.75)
    R['squall_gust'] = lambda: norm(wind(1.8, 900, 0.85, 0.6, 0, False) * adsr(1.8, 0.4, 0.4, 0.5, 0.9), 0.7)
    R['tailwind_gust'] = lambda: norm(wind(1.5, 1000, 0.8, 0.7, 0, False) * adsr(1.5, 0.3, 0.3, 0.5, 0.8), 0.6)
    R['tailwind_whisk'] = lambda: whoosh(0.5, 800, 2800, 0.15, 0.55)
    R['swell_slow'] = lambda: norm(wind(4, 600, 0.8, 0.2, 0, False) * adsr(4, 1.5, 0.8, 0.5, 1.5), 0.6)
    R['still_creak'] = lambda: creak(1.0, 100, 0.5)
    R['still_exhale'] = lambda: breath(1.4, True, 0.5)
    R['time_slow'] = lambda: norm(pmax(chirp(800, 120, 1.2) * exp_env(1.2, 0.5) * 0.5, ping(200, 1.2, tau=0.4, level=0.3, harmonics=4)), 0.6)
    R['vent_hiss'] = lambda: hiss(0.7, 2500, 6000, 0.3, 0.55)
    R['vent_hiss_loop'] = lambda: loopify(hiss(6, 2500, 6000, 3, 0.4), 1.5)
    R['glitch_tear'] = lambda: _glitch(0.5)
    R['glitch_return'] = lambda: _glitch(0.7, up=True)
    R['glitch_sub_drop'] = lambda: norm(pmax(chirp(160, 30, 0.6) * exp_env(0.6, 0.2), _glitch(0.3) * 0.4), 0.8)
    R['opening_alien'] = lambda: norm(pmax(drone(3, [55, 58.3, 110.2], level=0.5), breath(3, True, 0.2)), 0.6)
    R['opening_glitch'] = lambda: _glitch(1.0)
    R['hero_hurt'] = lambda: norm(pmax(thump(0.15, 120, 0.04, 0.7), breath(0.2, True, 0.4)), 0.7)
    R['hero_death'] = lambda: norm(pmax(growl(0.8, 90, 25, 0.5, 45), R['body_fall']()), 0.85)
    R['death_small'] = lambda: norm(pmax(thump(0.25, 100, 0.08, 0.6, 0.5, 600), hiss(0.3, 1500, 4000, 0.12, 0.3)), 0.7)
    R['death_large'] = lambda: norm(pmax(boom(1.0, 70, 30, 0.35, 0.85), rattle(0.5, 4, 800, 2200, 0.4)), 0.9)
    R['cave_drip'] = lambda: drip(0.7)
    R['cave_moan'] = lambda: norm(pmax(chirp(320, 180, 1.4) * adsr(1.4, 0.5, 0.3, 0.5, 0.5) * 0.4, breath(1.4, True, 0.3)), 0.5)
    R['sporecap_death'] = lambda: norm(pmax(gurgle(0.4, 3, 150, 400, 0.6), hiss(0.5, 2000, 5000, 0.2, 0.4)), 0.65)

    return R

def _crackle(dur):
    n = n_of(dur)
    x = np.zeros(n)
    for _ in range(int(dur * 40)):
        p = rng.integers(0, n - 300)
        L = rng.uniform(0.004, 0.015)
        seg = bandpass(white(L), 2500, 9000) * exp_env(L, 0.004) * rng.uniform(0.3, 1)
        x[p:p + len(seg)] += seg[:max(0, min(len(seg), n - p))]
    return norm(x + bandpass(white(dur), 1500, 5000) * 0.1, 0.8)

def _glitch(dur, up=False):
    n = n_of(dur)
    x = np.zeros(n)
    pos = 0
    while pos < n - 400:
        L = int(rng.uniform(0.01, 0.05) * SR)
        f = rng.uniform(200, 3000)
        seg = chirp(f, f * (2 if up else 0.5), L / SR) * rng.uniform(0.2, 0.7)
        x[pos:pos + L] += seg[:max(0, min(L, n - pos))]
        pos += int(rng.uniform(0.01, 0.06) * SR)
    return norm(x, 0.7)

def _loop_drips(dur, count):
    x = air(dur, 300, 1000, 0.2)
    n = len(x)
    for _ in range(count):
        p = rng.integers(0, n - n_of(0.7))
        d = drip(0.7, 0.5) * rng.uniform(0.4, 1)
        x[p:p + len(d)] += d[:max(0, min(len(d), n - p))]
    return loopify(norm(x, 0.6), 3.0)

def _shore(dur):
    t = t_of(dur)
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * t / 9) ** 2
    x = lowpass(brown(dur), 400) * (0.3 + 0.7 * swell)
    x += bandpass(white(dur), 1500, 5000) * 0.15 * swell
    return loopify(norm(x, 0.7), 3.0)

def main():
    ids = json.load(open('/tmp/the-lost-storm/data/sound-ids.json'))
    R = build()
    missing = [i for i in ids if i not in R]
    if missing:
        print('MISSING RECIPES:', missing)
        sys.exit(1)
    manifest = {'sfx': {}, 'voice': {}, 'clips': {}}
    for i, snd_id in enumerate(ids):
        x = R[snd_id]()
        save(snd_id, x)
        manifest['sfx'][snd_id] = ['sfx/' + snd_id + '.ogg']
        if (i + 1) % 25 == 0: print(f'{i+1}/{len(ids)}')
    with open(os.path.join(os.path.dirname(OUT), 'manifest.json'), 'w') as f:
        json.dump(manifest, f)
    print('done', len(ids))

main()
