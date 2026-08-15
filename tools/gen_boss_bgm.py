# -*- coding: utf-8 -*-
"""生成 Boss 战 BGM(v3): 沉重压迫史诗(BPM 116, D小调, 8小节 ≈ 16.6s 循环)
v2(A小调150)被用户否'感觉有点欢快'——快节奏+大调色彩和弦+上行琶音+密集hat
v3 改进: 慢速(116) + D小调暗色进行(Dm-Bb-Gm-A) + 低音区级进下行叹息旋律
     + 去hat(无高频活泼节拍) + 每拍根音重击 + 铜钹史诗点缀
"""
import wave, math, struct, os, random

SR = 22050
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))
os.makedirs(OUT, exist_ok=True)
random.seed(59)

def f(m): return 440.0 * 2 ** ((m - 69) / 12)

BPM = 116
BEAT = 60.0 / BPM          # 0.517s
BAR = BEAT * 4             # 2.07s
N_BARS = 8
TOTAL = BAR * N_BARS

# 暗色史诗pad(低八度根音 + 三和弦)
CHORDS = [
    (38, 41, 45, 50),  # Dm: D2 F2 A2 D3
    (34, 46, 50, 53),  # Bb: Bb1 Bb2 D3 F3
    (31, 43, 46, 50),  # Gm: G1 G2 Bb2 D3
    (33, 45, 49, 52),  # A:  A1 A2 C#3 E3 (A大, 导音压迫)
    (38, 41, 45, 50),
    (34, 46, 50, 53),
    (31, 43, 46, 50),
    (33, 45, 49, 52),
]
# 低音(每拍根音重击, 第4拍五度)
BASS = [
    [38, 38, 38, 45],  # Dm
    [34, 34, 34, 41],  # Bb
    [31, 31, 31, 38],  # Gm
    [33, 33, 33, 40],  # A
    [38, 38, 38, 45],
    [34, 34, 34, 41],
    [31, 31, 31, 38],
    [33, 33, 33, 40],
]
# 旋律(低音区级进下行 = 沉重叹息, 不欢快)
MELODY = [
    [62, 60, 58, 57],  # D4 C4 Bb3 A3
    [57, 53, 50, 46],  # A3 F3 D3 Bb2
    [55, 51, 50, 48],  # F3 Eb3 D3 C3
    [49, 48, 45, 43],  # C#3 C3 A2 G2 (半音张力)
    [62, 60, 58, 57],
    [57, 53, 50, 46],
    [55, 51, 50, 48],
    [49, 48, 45, 50],  # C#3 C3 A2 D3 (回主音)
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
    # 低音(三角波, 每拍根音重击)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(BASS[bar]):
            start = t0 + i * BEAT
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 0.85) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-2.5 * t) * min(1, t / 0.006)
                mix[j] += osc('triangle', f(midi), t) * env * 0.18
    # 暗色pad(正弦, 整小节)
    for bar in range(N_BARS):
        t0 = bar * BAR
        s0, s1 = int(t0 * SR), int((t0 + BAR) * SR)
        for m in CHORDS[bar]:
            for j in range(s0, s1):
                t = j / SR - t0
                env = min(1, t / 0.25) * min(1, (BAR - t) / 0.5)
                mix[j] += osc('sine', f(m), t) * env * 0.07
    # 旋律(三角波, 低音区下行, 长音短音交替)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(MELODY[bar]):
            start = t0 + i * BEAT
            dur = BEAT * (0.5 if i % 2 == 0 else 0.9)  # 奇拍长音(叹息)
            s0, s1 = int(start * SR), min(n, int((start + dur) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-3.2 * t) * min(1, t / 0.01)
                mix[j] += osc('triangle', f(midi), t) * env * 0.11
    # 鼓: 4-on-floor大鼓(1强) + 军鼓2/4 + 铜钹(段尾) — 无hat(去欢快感)
    def kick(t0, vol):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.14) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += math.sin(2 * math.pi * (85 - 50 * t) * t) * math.exp(-22 * t) * vol
    def snare(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.11) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-40 * t) * 0.17
    def crash(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.55) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-9 * t) * 0.09
    for bar in range(N_BARS):
        t0 = bar * BAR
        kick(t0, 0.30); kick(t0 + BEAT, 0.14); kick(t0 + 2 * BEAT, 0.20); kick(t0 + 3 * BEAT, 0.14)
        snare(t0 + BEAT); snare(t0 + 3 * BEAT)
        if bar % 4 == 3: crash(t0 + 3 * BEAT + 0.12)
    peak = max(1e-9, max(abs(v) for v in mix))
    gain = min(1.0, 0.9 / peak)
    return [v * gain for v in mix]

samples = render()
path = os.path.join(OUT, 'boss_bgm.wav')
with wave.open(path, 'w') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', max(-32767, min(32767, int(v * 32767)))) for v in samples))
print(f'boss_bgm.wav  时长{TOTAL:.1f}s  {os.path.getsize(path)//1024}KB  BPM={BPM}  D小调沉重压迫')
