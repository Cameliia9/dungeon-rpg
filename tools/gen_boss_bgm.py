# -*- coding: utf-8 -*-
"""生成 Boss 战 BGM: 压迫史诗感(BPM 138, D小调, 8小节 ≈ 13.9s 循环)
与普通战斗曲(BPM160 快速跳跃)区分: 慢速重击、轰鸣低音、小二度威胁旋律
声部: 轰鸣低音(三角波低频每拍重击) + 史诗pad(低八度根音+三和弦)
     + 威胁旋律(方波D5-Eb5小二度交替=警报感, 三角波柔化) + 定音鼓4-on-floor
     + 军鼓2/4 + 铜钹(每2小节末, 史诗战感)
和弦: Dm - Dm - Gm - A | Dm - Dm - Gm - A (i-iv-V, A大导音制造未解决张力)
"""
import wave, math, struct, os, random

SR = 22050
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))
os.makedirs(OUT, exist_ok=True)
random.seed(41)

def f(m): return 440.0 * 2 ** ((m - 69) / 12)

BPM = 138
BEAT = 60.0 / BPM          # 0.435s
BAR = BEAT * 4             # 1.74s
N_BARS = 8
TOTAL = BAR * N_BARS

# 史诗pad(低八度根音 + 三和弦)
CHORDS = [
    (38, 41, 45, 50),  # Dm: D2 F2 A2 D3
    (38, 41, 45, 50),  # Dm
    (31, 43, 46, 50),  # Gm: G1 G2 Bb2 D3
    (33, 45, 49, 52),  # A:  A1 A2 C#3 E3 (A大, 未解决张力)
    (38, 41, 45, 50),
    (38, 41, 45, 50),
    (31, 43, 46, 50),
    (33, 45, 49, 52),
]
# 低音(每拍根音重击, 轰鸣)
BASS = [
    [38, 38, 38, 45],  # D2 D2 D2 A2(五度)
    [38, 38, 38, 45],
    [31, 31, 31, 38],
    [33, 33, 33, 40],
    [38, 38, 38, 45],
    [38, 38, 38, 45],
    [31, 31, 31, 38],
    [33, 33, 33, 40],
]
# 威胁旋律(小二度交替 = 警报/威胁感; None=休止)
MELODY = [
    [74, 75, 74, 75],  # D5 Eb5 D5 Eb5
    [74, 75, 74, None],
    [72, 74, 72, 74],  # C5 D5(Gm上)
    [73, 74, 73, 74],  # C#5 D5(A上, 导音张力)
    [74, 75, 74, 75],
    [74, 75, 74, None],
    [72, 74, 72, 74],
    [75, 74, 73, 74],  # Eb5 D5 C#5 D5 (收束回Dm)
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
    # 轰鸣低音(三角波, 每拍重击, 持续0.9拍)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(BASS[bar]):
            start = t0 + i * BEAT
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 0.9) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-2.8 * t) * min(1, t / 0.005)
                mix[j] += osc('triangle', f(midi), t) * env * 0.19
    # 史诗pad(正弦, 低八度根音+三和弦, 整小节)
    for bar in range(N_BARS):
        t0 = bar * BAR
        s0, s1 = int(t0 * SR), int((t0 + BAR) * SR)
        for m in CHORDS[bar]:
            for j in range(s0, s1):
                t = j / SR - t0
                env = min(1, t / 0.2) * min(1, (BAR - t) / 0.4)
                mix[j] += osc('sine', f(m), t) * env * 0.075
    # 威胁旋律(三角波短音, 小二度交替)
    for bar in range(N_BARS):
        t0 = bar * BAR
        for i, midi in enumerate(MELODY[bar]):
            if midi is None: continue
            start = t0 + i * BEAT
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 0.8) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-4.5 * t) * min(1, t / 0.01)
                mix[j] += osc('triangle', f(midi), t) * env * 0.12
    # 定音鼓(4-on-floor, 1强3弱)
    def timpani(t0, vol):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.4) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += math.sin(2 * math.pi * (60 - 28 * t) * t) * math.exp(-7 * t) * vol
    # 军鼓(2/4 重击)
    def snare(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.12) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-38 * t) * 0.20
    # 铜钹(每2小节末, 史诗战感)
    def crash(t0):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.6) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += random.uniform(-1, 1) * math.exp(-10 * t) * 0.10
    for bar in range(N_BARS):
        t0 = bar * BAR
        timpani(t0, 0.34); timpani(t0 + BEAT, 0.16); timpani(t0 + 2 * BEAT, 0.24); timpani(t0 + 3 * BEAT, 0.16)
        snare(t0 + BEAT); snare(t0 + 3 * BEAT)
        if bar % 2 == 1: crash(t0 + 3 * BEAT + 0.15)  # 2/4/6/8小节末
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
print(f'boss_bgm.wav  时长{TOTAL:.1f}s  {os.path.getsize(path)//1024}KB  BPM={BPM}  D小调压迫史诗')
