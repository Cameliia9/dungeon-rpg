# -*- coding: utf-8 -*-
"""生成战斗 BGM: 紧张战斗风 chiptune(BPM 160, Em小调, 8小节 ≈ 12s 循环)
声部: 主旋律(方波 staccato 8分音符跳跃) + 低音(锯齿 8分音符根音-五度交替)
     + 密集琶音(方波 16分) + 鼓(4-on-floor底鼓 + 军鼓2/4 + 8分hi-hat)
和弦进行: Em-C-G-D | Em-C-D-Em (小调史诗战斗感)
"""
import wave, math, struct, os, random

SR = 22050
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))
os.makedirs(OUT, exist_ok=True)
random.seed(11)

def f(m): return 440.0 * 2 ** ((m - 69) / 12)

BPM = 160
BEAT = 60.0 / BPM          # 0.375s
BAR = BEAT * 4             # 1.5s
N_BARS = 8
TOTAL = BAR * N_BARS

# 主旋律: 每小节 8 个 8分音符(staccato, 紧张跳跃)
MELODY = [
    [64, 67, 71, 67, 64, 67, 71, 79],   # Em: E4 G4 B4 G4 E4 G4 B4 G5
    [72, 67, 64, 67, 72, 67, 76, 72],   # C:  C5 G4 E4 G4 C5 G4 E5 C5
    [71, 74, 67, 74, 71, 74, 67, 74],   # G:  B4 D5 G4 D5 B4 D5 G4 D5
    [69, 74, 66, 74, 69, 74, 66, 74],   # D:  A4 D5 F#4 D5 A4 D5 F#4 D5
    [64, 67, 71, 67, 64, 67, 71, 79],   # Em
    [72, 67, 64, 67, 72, 67, 76, 72],   # C
    [69, 66, 74, 71, 69, 66, 74, 71],   # D:  A4 F#4 D5 B4 (下行)
    [64, 67, 71, 67, 64, 71, 76, 71],   # Em (收尾回主音)
]
# 低音: 每小节 8 个 8分音符(根音-五度交替, 有力)
BASS = [
    [40, 47] * 4,   # Em: E2 B2
    [36, 43] * 4,   # C:  C2 G2
    [43, 50] * 4,   # G:  G2 D3
    [38, 45] * 4,   # D:  D2 A2
    [40, 47] * 4,
    [36, 43] * 4,
    [38, 45] * 4,
    [40, 47] * 4,
]
# 16分琶音(密集点缀): 每小节 16 个 16分音符
ARP = [
    [64, 67, 71, 74] * 4,  # Em7
    [72, 76, 79, 84] * 4,  # C
    [67, 71, 74, 79] * 4,  # G
    [66, 69, 74, 78] * 4,  # D
    [64, 67, 71, 74] * 4,
    [72, 76, 79, 84] * 4,
    [66, 69, 74, 78] * 4,
    [64, 67, 71, 74] * 4,
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
    # 主旋律(staccato 短音, 三角波——原方波尖锐被否; 平滑起音防咔哒瞬态)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(MELODY[bar]):
            start = t0 + i * BEAT * 0.5
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 0.38) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = min(1, t / 0.012) * math.exp(-6 * t)
                mix[j] += osc('triangle', f(midi), t) * env * 0.16
    # 低音(8分音符, 方波——原锯齿波是"漏电/电流声"源, 方波低音干净有力)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(BASS[bar]):
            start = t0 + i * BEAT * 0.5
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 0.42) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = min(1, t / 0.008) * math.exp(-9 * t)
                mix[j] += osc('square', f(midi), t) * env * 0.17
    # 16分琶音(三角波, 更轻——密集短音是"吱吱"感来源之一, 音量再降+平滑起音)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(ARP[bar]):
            start = t0 + i * BEAT * 0.25
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 0.2) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = min(1, t / 0.01) * math.exp(-16 * t)
                mix[j] += osc('triangle', f(midi), t) * env * 0.014
    # 鼓
    def kick(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.12) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += math.sin(2 * math.pi * (110 - 80 * t) * t) * math.exp(-28 * t) * 0.32
    def snare(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.10) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-45 * t) * 0.18
    def hat(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.035) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-95 * t) * 0.055
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i in range(4): kick(t0 + i * BEAT)          # 4-on-floor
        snare(t0 + BEAT); snare(t0 + 3 * BEAT)         # 2/4 军鼓
        for i in range(8): hat(t0 + i * BEAT * 0.5)    # 8分 hi-hat
    peak = max(1e-9, max(abs(v) for v in mix))
    gain = min(1.0, 0.9 / peak)
    return [v * gain for v in mix]

samples = render()
path = os.path.join(OUT, 'battle_bgm.wav')
with wave.open(path, 'w') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', max(-32767, min(32767, int(v * 32767)))) for v in samples))
print(f'battle_bgm.wav  时长{TOTAL:.1f}s  {os.path.getsize(path)//1024}KB  BPM={BPM}  8小节循环')
