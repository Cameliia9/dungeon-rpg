# -*- coding: utf-8 -*-
"""生成失败/死亡 BGM: 落幕哀歌(BPM 72, Am小调, 6小节 ≈ 20s, 一次性不循环)
声部: 旋律(三角波下行长音, 悲伤) + pad(正弦和弦) + 低音(正弦根音下行 A-G-F-E)
     + 心跳慢鼓(前4小节每2拍) + 结尾渐弱安静落幕
和弦: Am - F - C - E | Am - F (E 大导音, 未解决感=悲剧)
"""
import wave, math, struct, os

SR = 22050
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))
os.makedirs(OUT, exist_ok=True)

def f(m): return 440.0 * 2 ** ((m - 69) / 12)

BPM = 72
BEAT = 60.0 / BPM          # 0.833s
BAR = BEAT * 4             # 3.33s
N_BARS = 6
TOTAL = BAR * N_BARS

CHORDS = [
    (57, 60, 64),  # Am: A3 C4 E4
    (53, 57, 60),  # F:  F3 A3 C4
    (60, 64, 67),  # C:  C4 E4 G4
    (52, 56, 59),  # E:  E3 G#3 B3
    (57, 60, 64),  # Am
    (53, 57, 60),  # F
]
BASS = [45, 41, 48, 40, 45, 41]  # A2 F2 C3 E2 A2 F2 (下行 A-F-C-E 哀歌)
# 旋律: 每小节 [长音, 休止/短音, ...] 下行悲伤
MELODY = [
    [69, None, 69, 64],   # A4 - A4 E4
    [65, None, 65, 69],   # F4 - F4 A4
    [64, None, 64, 60],   # E4 - E4 C4
    [68, None, 63, 59],   # G#4 - B3 B3 (E大导音, 未解决)
    [64, 60, 57, None],   # E4 C4 A3 (回落)
    [65, None, 64, None], # F4 - E4 (半音收尾)
]

def osc(wave_type, freq, t):
    ph = 2 * math.pi * freq * t
    if wave_type == 'square': return 1.0 if math.sin(ph) >= 0 else -1.0
    if wave_type == 'triangle': return 2 * math.asin(math.sin(ph)) / math.pi
    if wave_type == 'saw': return 2 * (ph / (2 * math.pi) % 1.0) - 1.0
    return math.sin(ph)

def render():
    n = int(TOTAL * SR)
    mix = [0.0] * n
    # pad(正弦, 慢起慢落)
    for bar in range(N_BARS):
        t0 = bar * BAR
        s0, s1 = int(t0 * SR), int((t0 + BAR) * SR)
        for m in CHORDS[bar]:
            for j in range(s0, s1):
                t = j / SR - t0
                env = min(1, t / 0.4) * min(1, (BAR - t) / 0.8)
                mix[j] += osc('sine', f(m), t) * env * 0.09
    # 低音(正弦长音, 每小节下行)
    for bar in range(N_BARS):
        t0 = bar * BAR
        m = BASS[bar]
        s0, s1 = int(t0 * SR), int((t0 + BAR * 0.95) * SR)
        for j in range(s0, s1):
            t = j / SR - t0
            env = min(1, t / 0.2) * math.exp(-0.4 * t)
            mix[j] += osc('sine', f(m), t) * env * 0.17
    # 旋律(三角波, 长音悠长)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(MELODY[bar]):
            if midi is None: continue
            start = t0 + i * BEAT
            dur = BEAT * 2.4 if i % 2 == 0 else BEAT * 1.2
            s0, s1 = int(start * SR), min(n, int((start + dur) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-1.1 * t) * min(1, t / 0.04)
                mix[j] += osc('triangle', f(midi), t) * env * 0.13
    # 心跳慢鼓(前4小节每2拍, 后2小节安静)
    def kick(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.16) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += math.sin(2 * math.pi * (75 - 50 * t) * t) * math.exp(-20 * t) * 0.22
    for bar in range(4):
        t0 = bar * BAR
        kick(t0); kick(t0 + 2 * BEAT)
    # 整体渐弱(最后2小节淡出, 落幕感)
    fadeStart = int((TOTAL - 2 * BAR) * SR)
    for j in range(fadeStart, n):
        t = (j - fadeStart) / ((n - fadeStart) * 1.0)
        mix[j] *= 1 - t * 0.85
    peak = max(1e-9, max(abs(v) for v in mix))
    gain = min(1.0, 0.9 / peak)
    return [v * gain for v in mix]

samples = render()
path = os.path.join(OUT, 'defeat_bgm.wav')
with wave.open(path, 'w') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', max(-32767, min(32767, int(v * 32767)))) for v in samples))
print(f'defeat_bgm.wav  时长{TOTAL:.1f}s  {os.path.getsize(path)//1024}KB  BPM={BPM}  6小节落幕哀歌(一次性)')
