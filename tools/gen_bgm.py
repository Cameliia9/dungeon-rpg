# -*- coding: utf-8 -*-
"""生成更饱满的 BGM: 多声部 chiptune(主旋律+和声+低音+鼓)
和弦进行: Am - F - C - G | Am - F - C - E (经典小调史诗感)
BPM=128, 8小节循环 ≈ 15s
"""
import wave, math, struct, os, random

SR = 22050
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))
os.makedirs(OUT, exist_ok=True)
random.seed(7)

# midi note -> 频率
def f(m): return 440.0 * 2 ** ((m - 69) / 12)

BPM = 128
BEAT = 60.0 / BPM          # 每拍秒
BAR = BEAT * 4             # 每小节 4 拍
N_BARS = 8
TOTAL = BAR * N_BARS

# 和弦(每小节): (根音midi, 五度midi) 和声长音
CHORDS = [
    (57, 64),  # Am: A3 E4
    (53, 60),  # F:  F3 C4
    (48, 55),  # C:  C3 G3
    (43, 50),  # G:  G2 D3
    (57, 64),  # Am
    (53, 60),  # F
    (48, 55),  # C
    (52, 59),  # E:  E3 B3
]
# 低音(每拍): 根音, 第4拍跳高八度
BASS = [
    [45, 45, 45, 57], [41, 41, 41, 53], [48, 48, 48, 60], [43, 43, 43, 55],
    [45, 45, 45, 57], [41, 41, 41, 53], [48, 48, 48, 60], [40, 40, 40, 52],
]
# 主旋律(每小节4音, 第2/4音延长半拍形成节奏感; None=休止)
MELODY = [
    [76, None, 69, 72],   # E5 - A4 C5
    [77, 72, 69, 74],     # F5 C5 A4 D5
    [79, 76, 72, 79],     # G5 E5 C5 G5
    [74, 71, 67, 74],     # D5 B4 G4 D5
    [76, None, 69, 72],
    [77, 72, 69, 74],
    [79, 76, 72, 84],     # G5 E5 C5 C6
    [80, 76, 71, 80],     # G#5 E5 B4 G#5
]

def osc(wave_type, freq, t, phase=0.0):
    ph = 2 * math.pi * freq * t + phase
    if wave_type == 'square': return 1.0 if math.sin(ph) >= 0 else -1.0
    if wave_type == 'triangle': return 2 * math.asin(math.sin(ph)) / math.pi
    if wave_type == 'saw': return 2 * (ph / (2 * math.pi) % 1.0) - 1.0
    return math.sin(ph)

def render():
    n = int(TOTAL * SR)
    mix = [0.0] * n
    # --- 主旋律(方波, 轻微锯齿感=明亮) ---
    for bar in range(N_BARS):
        t0 = bar * BAR
        notes = MELODY[bar]
        for i, midi in enumerate(notes):
            if midi is None: continue
            start = t0 + i * BEAT
            dur = BEAT * 1.8 if i % 2 == 1 else BEAT * 0.9  # 偶数拍长音
            s0, s1 = int(start * SR), min(n, int((start + dur) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-2.2 * t) * min(1, t / 0.01)
                mix[j] += osc('square', f(midi), t) * env * 0.16
    # --- 和声(三角波, 根音+五度持续整小节, 音量小) ---
    for bar in range(N_BARS):
        t0 = bar * BAR
        s0, s1 = int(t0 * SR), int((t0 + BAR) * SR)
        for m in CHORDS[bar]:
            for j in range(s0, s1):
                t = j / SR - t0
                env = min(1, t / 0.05) * math.exp(-0.35 * t)
                mix[j] += osc('triangle', f(m), t) * env * 0.07
    # --- 低音(锯齿波, 每拍, 力度较强) ---
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(BASS[bar]):
            start = t0 + i * BEAT
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 0.95) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-3.5 * t)
                mix[j] += osc('saw', f(midi), t) * env * 0.20
    # --- 鼓 ---
    def kick(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.12) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += math.sin(2 * math.pi * (120 - 90 * t) * t) * math.exp(-30 * t) * 0.30
    def snare(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.10) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-45 * t) * 0.16
    def hat(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.04) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-90 * t) * 0.05
    for bar in range(N_BARS):
        t0 = bar * BAR
        kick(t0); kick(t0 + 2 * BEAT)          # 1、3拍底鼓
        snare(t0 + BEAT); snare(t0 + 3 * BEAT) # 2、4拍军鼓
        for i in range(4): hat(t0 + i * BEAT)  # 每拍hi-hat
    # 软限幅防削波
    peak = max(1e-9, max(abs(v) for v in mix))
    gain = min(1.0, 0.9 / peak)
    return [v * gain for v in mix]

samples = render()
path = os.path.join(OUT, 'bgm.wav')
with wave.open(path, 'w') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', max(-32767, min(32767, int(v * 32767)))) for v in samples))
print(f'bgm.wav  时长{TOTAL:.1f}s  {os.path.getsize(path)//1024}KB  BPM={BPM}  8小节循环')
