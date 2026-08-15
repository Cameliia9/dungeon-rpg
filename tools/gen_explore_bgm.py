# -*- coding: utf-8 -*-
"""生成探索 BGM: 地牢探险风(BPM 100, D小调, 8小节 ≈ 19s 循环)
声部: pad(正弦和弦长音, 空旷) + 低音(根音长音) + 旋律(三角波神秘动机, 悠长衰减)
     + 心跳底鼓(每2拍, 幽深) + 稀疏hi-hat + 风铃(高音点缀, 洞穴回声感)
和弦: Dm - Bb - F - C | Dm - Bb - Gm - Dm (小调下行, 幽暗探险)
"""
import wave, math, struct, os, random

SR = 22050
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))
os.makedirs(OUT, exist_ok=True)
random.seed(23)

def f(m): return 440.0 * 2 ** ((m - 69) / 12)

BPM = 100
BEAT = 60.0 / BPM          # 0.6s
BAR = BEAT * 4             # 2.4s
N_BARS = 8
TOTAL = BAR * N_BARS

# pad 三和弦(中低音区, 正弦)
CHORDS = [
    (50, 53, 57),  # Dm: D3 F3 A3
    (46, 50, 53),  # Bb: Bb2 D3 F3
    (41, 45, 48),  # F:  F2 A2 C3
    (48, 52, 55),  # C:  C3 E3 G3
    (50, 53, 57),  # Dm
    (46, 50, 53),  # Bb
    (43, 46, 50),  # Gm: G2 Bb2 D3
    (50, 53, 57),  # Dm
]
# 低音(每小节根音长音)
BASS = [38, 34, 41, 36, 38, 34, 43, 38]  # D2 Bb1 F2 C2 D2 Bb1 G2 D2
# 旋律(三角波, 神秘动机; None=休止)
MELODY = [
    [62, None, 65, 62],   # D4 - F4 D4
    [65, 62, 58, None],   # F4 D4 Bb3
    [65, 69, None, 65],   # F4 A4 - F4
    [72, None, 67, 64],   # C5 - G4 E4
    [62, 65, 62, None],   # D4 F4 D4
    [65, 62, 58, 65],     # F4 D4 Bb3 F4
    [58, 62, 65, None],   # Bb3 D4 F4
    [62, None, 65, 62],   # D4 - F4 D4 (回到主音)
]
# 风铃(高音点缀): 每小节可选 (midi, 起始拍), None=无
BELLS = [
    (86, 3), None, (88, 3), None,
    (86, 3), None, (83, 3), (86, 3),
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
    # pad(正弦, 和弦长音, 慢起慢落 = 空旷感)
    for bar in range(N_BARS):
        t0 = bar * BAR
        s0, s1 = int(t0 * SR), int((t0 + BAR) * SR)
        for m in CHORDS[bar]:
            for j in range(s0, s1):
                t = j / SR - t0
                env = min(1, t / 0.3) * min(1, (BAR - t) / 0.6)  # 淡入淡出
                mix[j] += osc('sine', f(m), t) * env * 0.085
    # 低音(正弦长音, 幽深)
    for bar in range(N_BARS):
        t0 = bar * BAR
        m = BASS[bar]
        s0, s1 = int(t0 * SR), int((t0 + BAR * 0.95) * SR)
        for j in range(s0, s1):
            t = j / SR - t0
            env = min(1, t / 0.15) * math.exp(-0.5 * t)
            mix[j] += osc('sine', f(m), t) * env * 0.18
    # 旋律(三角波, 悠长)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(MELODY[bar]):
            if midi is None: continue
            start = t0 + i * BEAT
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 1.9) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-1.6 * t) * min(1, t / 0.02)
                mix[j] += osc('triangle', f(midi), t) * env * 0.11
    # 风铃(高频正弦短音, 回声感)
    for bar in range(N_BARS):
        if BELLS[bar] is None: continue
        midi, beat = BELLS[bar]
        start = bar * BAR + beat * BEAT
        s0, s1 = int(start * SR), min(n, int((start + 0.5) * SR))
        for j in range(s0, s1):
            t = j / SR - start
            env = math.exp(-7 * t)
            mix[j] += osc('sine', f(midi), t) * env * 0.05
    # 鼓: 心跳底鼓(每2拍) + 稀疏hat
    def kick(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.15) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += math.sin(2 * math.pi * (85 - 55 * t) * t) * math.exp(-22 * t) * 0.24
    def hat(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.03) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-110 * t) * 0.028
    for bar in range(N_BARS):
        t0 = bar * BAR
        kick(t0); kick(t0 + 2 * BEAT)             # 心跳: 1、3拍
        hat(t0 + 3.5 * BEAT)                       # 每小节一次轻擦(洞穴滴水感)
    peak = max(1e-9, max(abs(v) for v in mix))
    gain = min(1.0, 0.9 / peak)
    return [v * gain for v in mix]

samples = render()
path = os.path.join(OUT, 'explore_bgm.wav')
with wave.open(path, 'w') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', max(-32767, min(32767, int(v * 32767)))) for v in samples))
print(f'explore_bgm.wav  时长{TOTAL:.1f}s  {os.path.getsize(path)//1024}KB  BPM={BPM}  8小节(Dm小调地牢探险)')
