# -*- coding: utf-8 -*-
"""生成 Boss 战 BGM(换曲): 史诗主题曲(BPM 150, A小调, 8小节 ≈ 12.8s 循环)
与普通战斗曲区分: 鲜明的Boss主题旋律(级进+跳进, 有记忆点, 非机械警报音)
声部: 主题旋律(三角波+低八度叠奏=史诗感) + 8分推进低音 + 史诗pad
     + 4-on-floor大鼓 + 军鼓2/4 + 8分hat + 段尾铜钹
和弦: Am - F - C - G | Am - F - G - E (经典史诗循环, E大导回Am)
"""
import wave, math, struct, os, random

SR = 22050
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))
os.makedirs(OUT, exist_ok=True)
random.seed(53)

def f(m): return 440.0 * 2 ** ((m - 69) / 12)

BPM = 150
BEAT = 60.0 / BPM          # 0.4s
BAR = BEAT * 4             # 1.6s
N_BARS = 8
TOTAL = BAR * N_BARS

# 史诗pad(三和弦 + 高八度, 音域宽)
CHORDS = [
    (45, 48, 52, 57),  # Am: A2 C3 E3 A3
    (41, 45, 48, 53),  # F:  F2 A2 C3 F3
    (48, 52, 55, 60),  # C:  C3 E3 G3 C4
    (43, 47, 50, 55),  # G:  G2 B2 D3 G3
    (45, 48, 52, 57),
    (41, 45, 48, 53),
    (43, 47, 50, 55),
    (40, 44, 47, 52),  # E:  E2 G#2 B2 E3 (E大导回)
]
# 低音(8分音符根音-五度推进, 有能量)
BASS = [
    [45, 52, 45, 52, 45, 52, 45, 52],  # Am: A2 E3
    [41, 48, 41, 48, 41, 48, 41, 48],  # F
    [48, 55, 48, 55, 48, 55, 48, 55],  # C
    [43, 50, 43, 50, 43, 50, 43, 50],  # G
    [45, 52, 45, 52, 45, 52, 45, 52],
    [41, 48, 41, 48, 41, 48, 41, 48],
    [43, 50, 43, 50, 43, 50, 43, 50],
    [40, 47, 40, 47, 40, 47, 40, 47],  # E
]
# Boss 主题旋律(8分音符, 级进+跳进, 有记忆点; None=休止)
MELODY = [
    [69, 72, 76, 72, 69, 67, 64, None],  # A4 C5 E5 C5 A4 G4 E4 -
    [65, 69, 72, 69, 65, 64, 65, None],  # F4 A4 C5 A4 F4 E4 F4 -
    [72, 76, 79, 76, 72, 71, 67, None],  # C5 E5 G5 E5 C5 B4 G4 -
    [67, 71, 74, 71, 67, 66, 67, None],  # G4 B4 D5 B4 G4 F#4 G4 -
    [69, 72, 76, 72, 69, 67, 64, None],
    [65, 69, 72, 69, 65, 64, 65, None],
    [67, 71, 74, 71, 67, 66, 67, None],
    [68, 71, 76, 71, 68, 67, 68, None],  # G#4 B4 E5 ... (E大, 导音张力)
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
    # 低音(三角波8分音符, 推进感)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(BASS[bar]):
            start = t0 + i * BEAT * 0.5
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 0.42) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-7 * t) * min(1, t / 0.004)
                mix[j] += osc('triangle', f(midi), t) * env * 0.17
    # 史诗pad(正弦, 整小节)
    for bar in range(N_BARS):
        t0 = bar * BAR
        s0, s1 = int(t0 * SR), int((t0 + BAR) * SR)
        for m in CHORDS[bar]:
            for j in range(s0, s1):
                t = j / SR - t0
                env = min(1, t / 0.15) * min(1, (BAR - t) / 0.35)
                mix[j] += osc('sine', f(m), t) * env * 0.07
    # 主题旋律(三角波主音 + 低八度叠奏 = 史诗感)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(MELODY[bar]):
            if midi is None: continue
            start = t0 + i * BEAT * 0.5
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 0.42) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-6 * t) * min(1, t / 0.008)
                mix[j] += osc('triangle', f(midi), t) * env * 0.11     # 主音
                mix[j] += osc('triangle', f(midi - 12), t) * env * 0.05  # 低八度叠奏
    # 鼓: 4-on-floor大鼓 + 军鼓2/4 + 8分hat + 段尾铜钹
    def kick(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.13) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += math.sin(2 * math.pi * (95 - 55 * t) * t) * math.exp(-25 * t) * 0.30
    def snare(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.10) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-42 * t) * 0.17
    def hat(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.035) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-95 * t) * 0.05
    def crash(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.55) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-9 * t) * 0.09
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i in range(4): kick(t0 + i * BEAT)
        snare(t0 + BEAT); snare(t0 + 3 * BEAT)
        for i in range(8): hat(t0 + i * BEAT * 0.5)
        if bar % 4 == 3: crash(t0 + 3 * BEAT + 0.12)  # 4/8小节末铜钹
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
print(f'boss_bgm.wav  时长{TOTAL:.1f}s  {os.path.getsize(path)//1024}KB  BPM={BPM}  A小调史诗主题曲')
