# -*- coding: utf-8 -*-
"""生成故事背景 BGM(重制): 沉重历史感(BPM 75, C小调, 8小节 ≈ 25.6s 循环)
声部: 大钟开场(低频) + 厚重低音(锯齿, 极低音域) + pad(正弦暗和弦)
     + 圣咏式旋律(长音级进) + 定音鼓(1/3拍沉重击打)
和弦: Cm - Ab - Bb - G | Cm - Ab - Bb - G (哥特小调进行, 末小节解决回Cm)
"""
import wave, math, struct, os, random

SR = 22050
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))
os.makedirs(OUT, exist_ok=True)
random.seed(37)

def f(m): return 440.0 * 2 ** ((m - 69) / 12)

BPM = 75
BEAT = 60.0 / BPM          # 0.8s
BAR = BEAT * 4             # 3.2s
N_BARS = 8
TOTAL = BAR * N_BARS

# pad 三和弦(中低音区, 暗)
CHORDS = [
    (48, 51, 55),  # Cm: C3 Eb3 G3
    (44, 48, 51),  # Ab: Ab2 C3 Eb3
    (46, 50, 53),  # Bb: Bb2 D3 F3
    (43, 47, 50),  # G:  G2 B2 D3
    (48, 51, 55),
    (44, 48, 51),
    (46, 50, 53),
    (43, 47, 50),  # G → Cm 导回
]
# 低音(极低根音, 锯齿厚重)
BASS = [36, 32, 34, 31, 36, 32, 34, 31]  # C2 Ab1 Bb1 G1
# 旋律(圣咏式长音, 级进庄重)
MELODY = [
    [67, None, 63, None],  # G4 - Eb4
    [68, None, 63, None],  # Ab4 - Eb4
    [70, None, 65, None],  # Bb4 - F4
    [67, None, 62, None],  # G4 - D4
    [67, None, 63, None],
    [68, None, 63, None],
    [70, None, 65, None],
    [63, None, 60, None],  # Eb4 - C4 (解决回主音)
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
    # 大钟开场(60Hz 基频 + 泛音, 长衰减, 历史沉重感)
    s0, s1 = 0, int(2.6 * SR)
    for j in range(s0, s1):
        t = j / SR
        env = math.exp(-1.6 * t)
        mix[j] += (osc('sine', f(36), t) + 0.5 * osc('sine', f(48), t) + 0.3 * osc('sine', f(60), t)) * env * 0.16
    # 低音(锯齿, 极低, 厚重持续)
    for bar in range(N_BARS):
        t0 = bar * BAR
        m = BASS[bar]
        s0, s1 = int(t0 * SR), int((t0 + BAR * 0.95) * SR)
        for j in range(s0, s1):
            t = j / SR - t0
            env = min(1, t / 0.1) * math.exp(-0.4 * t)
            mix[j] += osc('saw', f(m), t) * env * 0.20
    # pad(正弦, 暗, 慢起慢落)
    for bar in range(N_BARS):
        t0 = bar * BAR
        s0, s1 = int(t0 * SR), int((t0 + BAR) * SR)
        for m in CHORDS[bar]:
            for j in range(s0, s1):
                t = j / SR - t0
                env = min(1, t / 0.5) * min(1, (BAR - t) / 0.9)
                mix[j] += osc('sine', f(m), t) * env * 0.08
    # 旋律(三角波, 圣咏长音)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(MELODY[bar]):
            if midi is None: continue
            start = t0 + i * BEAT
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 1.9) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-0.9 * t) * min(1, t / 0.08)
                mix[j] += osc('triangle', f(midi), t) * env * 0.10
    # 定音鼓(每小节 1、3 拍, 1强3弱, 沉重)
    def timpani(t0, vol):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.5) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += math.sin(2 * math.pi * (55 - 25 * t) * t) * math.exp(-6 * t) * vol
    for bar in range(N_BARS):
        t0 = bar * BAR
        timpani(t0, 0.34)             # 第1拍重击
        timpani(t0 + 2 * BEAT, 0.20)  # 第3拍稍弱
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
print(f'story_bgm.wav  时长{TOTAL:.1f}s  {os.path.getsize(path)//1024}KB  BPM={BPM}  C小调沉重历史感')
