# -*- coding: utf-8 -*-
"""生成故事背景 BGM: 传说叙事风(BPM 85, A小调, 8小节 ≈ 22.6s 循环)
声部: 开场钟声(低频长衰减, 传说开启感) + pad(正弦长和弦, 空旷神秘)
     + 旋律(三角波吟唱感长音) + 轻低音 + 稀疏心跳鼓(很轻)
和弦: Am - F - C - G | Am - F - C - E (史诗小调, 与主页/战斗区分)
"""
import wave, math, struct, os, random

SR = 22050
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))
os.makedirs(OUT, exist_ok=True)
random.seed(31)

def f(m): return 440.0 * 2 ** ((m - 69) / 12)

BPM = 85
BEAT = 60.0 / BPM          # 0.706s
BAR = BEAT * 4             # 2.82s
N_BARS = 8
TOTAL = BAR * N_BARS

# pad 三和弦(中低音区)
CHORDS = [
    (45, 48, 52),  # Am: A2 C3 E3
    (41, 45, 48),  # F:  F2 A2 C3
    (48, 52, 55),  # C:  C3 E3 G3
    (43, 47, 50),  # G:  G2 B2 D3
    (45, 48, 52),  # Am
    (41, 45, 48),  # F
    (48, 52, 55),  # C
    (40, 44, 47),  # E:  E2 G#2 B2 (E大导回Am)
]
# 低音(根音长音)
BASS = [33, 29, 36, 31, 33, 29, 36, 28]  # A1 F1 C2 G1 A1 F1 C2 E1
# 旋律(吟唱感长音, 三角波): 每小节2个长音
MELODY = [
    [69, None, 65, None],  # A4 - E4
    [65, None, 69, None],  # E4 - A4
    [72, None, 69, None],  # C5 - A4
    [67, None, 64, None],  # G4 - E4
    [69, None, 65, None],
    [65, None, 69, None],
    [72, None, 67, None],  # C5 - G4
    [68, None, 64, None],  # G#4 - E4 (E大, 导回)
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
    # 开场钟声(第一小节起, 低频长衰减)
    bell_start = 0.0
    s0, s1 = int(bell_start * SR), min(n, int((bell_start + 2.2) * SR))
    for j in range(s0, s1):
        t = j / SR - bell_start
        env = math.exp(-2.0 * t)
        mix[j] += (osc('sine', f(50), t) + 0.4 * osc('sine', f(62), t)) * env * 0.14
    # pad(正弦长和弦, 慢起慢落, 空旷)
    for bar in range(N_BARS):
        t0 = bar * BAR
        s0, s1 = int(t0 * SR), int((t0 + BAR) * SR)
        for m in CHORDS[bar]:
            for j in range(s0, s1):
                t = j / SR - t0
                env = min(1, t / 0.4) * min(1, (BAR - t) / 0.8)
                mix[j] += osc('sine', f(m), t) * env * 0.075
    # 低音(长音, 轻)
    for bar in range(N_BARS):
        t0 = bar * BAR
        m = BASS[bar]
        s0, s1 = int(t0 * SR), int((t0 + BAR * 0.92) * SR)
        for j in range(s0, s1):
            t = j / SR - t0
            env = min(1, t / 0.2) * math.exp(-0.45 * t)
            mix[j] += osc('sine', f(m), t) * env * 0.13
    # 旋律(吟唱感长音)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(MELODY[bar]):
            if midi is None: continue
            start = t0 + i * BEAT
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 1.8) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-1.1 * t) * min(1, t / 0.05)
                mix[j] += osc('triangle', f(midi), t) * env * 0.10
    # 稀疏心跳鼓(每2小节一下, 很轻)
    def kick(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.15) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += math.sin(2 * math.pi * (70 - 40 * t) * t) * math.exp(-18 * t) * 0.15
    for bar in range(N_BARS):
        if bar % 2 == 0:
            kick(bar * BAR + BEAT * 3)  # 每2小节第4拍一下心搏
    peak = max(1e-9, max(abs(v) for v in mix))
    gain = min(1.0, 0.9 / peak)
    return [v * gain for v in mix]

samples = render()
path = os.path.join(OUT, 'story_bgm.wav')
with wave.open(path, 'w') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', max(-32767, min(32767, int(v * 32767)))) for v in samples))
print(f'story_bgm.wav  时长{TOTAL:.1f}s  {os.path.getsize(path)//1024}KB  BPM={BPM}  8小节(A小调传说叙事)')
