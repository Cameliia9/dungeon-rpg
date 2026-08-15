# -*- coding: utf-8 -*-
"""生成 Boss 战 BGM(v5): 压迫但流动(BPM 112, D小调, 8小节 ≈ 17.1s 循环)
迭代: v2欢快→v3不够沉→v4踏板静止像死机→v5=沉重+推进
v5 要点: ①和声每小节变化(Dm-Bb-Gm-A, 暗色但有推进, 非静止踏板)
        ②低音每拍根音重击(厚) ③下行叹息旋律(附点节奏: 短-短-长)
        ④4-on-floor大鼓+军鼓2/4 ⑤后半段(bar5-8)加8分hat = 动态越来越压
        ⑥A和弦C#保留(小二度张紧点)
"""
import wave, math, struct, os, random

SR = 22050
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))
os.makedirs(OUT, exist_ok=True)
random.seed(67)

def f(m): return 440.0 * 2 ** ((m - 69) / 12)

BPM = 112
BEAT = 60.0 / BPM          # 0.536s
BAR = BEAT * 4             # 2.14s
N_BARS = 8
TOTAL = BAR * N_BARS

# 暗色进行(每小节变, 低八度根音+三和弦; A含C#张紧)
CHORDS = [
    (38, 41, 45, 50),  # Dm: D2 F2 A2 D3
    (34, 46, 50, 53),  # Bb: Bb1 Bb2 D3 F3
    (31, 43, 46, 50),  # Gm: G1 G2 Bb2 D3
    (33, 45, 49, 52),  # A:  A1 A2 C#3 E3
    (38, 41, 45, 50),
    (34, 46, 50, 53),
    (31, 43, 46, 50),
    (33, 45, 49, 52),
]
# 低音(每拍根音重击, 第4拍五度)
BASS = [
    [38, 38, 38, 45],
    [34, 34, 34, 41],
    [31, 31, 31, 38],
    [33, 33, 33, 40],
    [38, 38, 38, 45],
    [34, 34, 34, 41],
    [31, 31, 31, 38],
    [33, 33, 33, 40],
]
# 下行叹息旋律(附点: 第1音3/4拍, 第2音1/4拍, 第3音长音1.5拍; None=休止)
MELODY = [
    [62, 60, 58, None],  # D4 C4 Bb3 -
    [58, 55, 53, None],  # Bb3 G3 F3 -
    [55, 51, 50, None],  # F3 Eb3 D3 -
    [49, 48, 45, None],  # C#3 C3 A2 (半音张紧)
    [62, 60, 58, 57],    # 后半段更密
    [57, 53, 50, 46],
    [55, 51, 50, 48],
    [49, 48, 45, 50],    # 解决回D
]
# 附点节奏(每音拍数)
RHYTHM = [
    [0.75, 0.25, 1.5, 0],
    [0.75, 0.25, 1.5, 0],
    [0.75, 0.25, 1.5, 0],
    [0.75, 0.25, 1.5, 0],
    [0.5, 0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5, 0.5],
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
    # 低音(三角波, 每拍根音重击, 厚)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(BASS[bar]):
            start = t0 + i * BEAT
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 0.85) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-2.5 * t) * min(1, t / 0.006)
                mix[j] += osc('triangle', f(midi), t) * env * 0.19
    # 暗色pad(正弦, 每小节)
    for bar in range(N_BARS):
        t0 = bar * BAR
        s0, s1 = int(t0 * SR), int((t0 + BAR) * SR)
        for m in CHORDS[bar]:
            for j in range(s0, s1):
                t = j / SR - t0
                env = min(1, t / 0.2) * min(1, (BAR - t) / 0.45)
                mix[j] += osc('sine', f(m), t) * env * 0.075
    # 旋律(三角波, 附点叹息, 低音区)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(MELODY[bar]):
            if midi is None: continue
            start = t0 + i * BEAT
            dur = RHYTHM[bar][i] * BEAT
            s0, s1 = int(start * SR), min(n, int((start + dur) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-2.8 * t) * min(1, t / 0.01)
                mix[j] += osc('triangle', f(midi), t) * env * 0.11
    # 鼓: 4-on-floor大鼓(1强) + 军鼓2/4 + 后半段8分hat(推进) — 无铜钹
    def kick(t0, vol):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.14) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += math.sin(2 * math.pi * (85 - 50 * t) * t) * math.exp(-22 * t) * vol
    def snare(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.11) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-40 * t) * 0.18
    def hat(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.035) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-95 * t) * 0.04
    for bar in range(N_BARS):
        t0 = bar * BAR
        kick(t0, 0.30); kick(t0 + BEAT, 0.14); kick(t0 + 2 * BEAT, 0.20); kick(t0 + 3 * BEAT, 0.14)
        snare(t0 + BEAT); snare(t0 + 3 * BEAT)
        if bar >= 4:  # 后半段 8分hat = 越来越压
            for i in range(8): hat(t0 + i * BEAT * 0.5)
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
print(f'boss_bgm.wav  时长{TOTAL:.1f}s  {os.path.getsize(path)//1024}KB  BPM={BPM}  D小调压迫流动')
