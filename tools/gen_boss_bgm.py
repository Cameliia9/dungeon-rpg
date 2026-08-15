# -*- coding: utf-8 -*-
"""生成 Boss 战 BGM(v4): 窒息级压迫(BPM 96, D小调踏板音, 8小节 ≈ 20s 循环)
v3(116)被否'还不够沉重, 要压得人喘不过气'
v4 手法: ①BPM 96 慢到窒息 ②持续D2踏板低音全程不动(悬而未决)
        ③上方和声游移, A和弦C#3与D低音小二度尖锐冲突(不协和压迫)
        ④只留低频心跳鼓(每2拍), 删军鼓/hat/铜钹(去掉任何'进行曲/燃'感)
        ⑤高音悬置长音(A4, 每2小节末, 耳鸣般叹息) ⑥无旋律(氛围化)
"""
import wave, math, struct, os, random

SR = 22050
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))
os.makedirs(OUT, exist_ok=True)
random.seed(61)

def f(m): return 440.0 * 2 ** ((m - 69) / 12)

BPM = 96
BEAT = 60.0 / BPM          # 0.625s
BAR = BEAT * 4             # 2.5s
N_BARS = 8
TOTAL = BAR * N_BARS

# 上方和声(每2小节一组, 低音踏板D2全程不动; A和弦C#3 vs D2小二度冲突)
HARMONY = [
    (41, 45, 50),  # Dm: F2 A2 D3
    (41, 45, 50),  # Dm
    (46, 50, 53),  # Bb: Bb2 D3 F3
    (46, 50, 53),  # Bb
    (41, 45, 50),  # Dm
    (41, 45, 50),  # Dm
    (49, 52, 45),  # A:  C#3 E3 A2 (C# vs D 踏板 = 小二度尖锐)
    (41, 45, 50),  # 回 Dm
]
# 踏板低音: 全程 D2=38, 第1小节起持续; 每2拍重击(心跳)
PEDAL = 38

def osc(wave_type, freq, t):
    ph = 2 * math.pi * freq * t
    if wave_type == 'square': return 1.0 if math.sin(ph) >= 0 else -1.0
    if wave_type == 'triangle': return 2 * math.asin(math.sin(ph)) / math.pi
    if wave_type == 'saw': return 2 * (ph / (2 * math.pi) % 1.0) - 1.0
    return math.sin(ph)

def render():
    n = int(TOTAL * SR)
    mix = [0.0] * n
    # 踏板低音: D2 持续整曲(长音, 低沉轰鸣) + D3 每2小节叠加(加厚)
    for bar in range(N_BARS):
        t0 = bar * BAR
        s0, s1 = int(t0 * SR), int((t0 + BAR * 1.0) * SR)
        for j in range(s0, s1):
            t = j / SR - t0
            env = min(1, t / 0.2) * math.exp(-0.18 * t)
            mix[j] += osc('triangle', f(PEDAL), t) * env * 0.22
        if bar % 2 == 1:  # 每2小节 D3 加厚
            s0, s1 = int(t0 * SR), int((t0 + BAR * 0.9) * SR)
            for j in range(s0, s1):
                t = j / SR - t0
                env = min(1, t / 0.3) * math.exp(-0.25 * t)
                mix[j] += osc('triangle', f(50), t) * env * 0.10
    # 和声(正弦, 暗, 每2小节一组)
    for bar in range(N_BARS):
        t0 = bar * BAR
        s0, s1 = int(t0 * SR), int((t0 + BAR) * SR)
        for m in HARMONY[bar]:
            for j in range(s0, s1):
                t = j / SR - t0
                env = min(1, t / 0.5) * min(1, (BAR - t) / 0.8)
                mix[j] += osc('sine', f(m), t) * env * 0.075
    # 高音悬置(A4 长音, 每2小节末, 耳鸣般叹息; 很轻)
    for bar in range(N_BARS):
        if bar % 2 == 0:
            start = bar * BAR + 2 * BEAT
            s0, s1 = int(start * SR), min(n, int((start + BEAT * 1.8) * SR))
            for j in range(s0, s1):
                t = j / SR - start
                env = math.exp(-1.6 * t) * min(1, t / 0.1)
                mix[j] += osc('triangle', f(69), t) * env * 0.045
    # 心跳鼓(每2拍, 低频沉重; 无军鼓/hat/铜钹 = 去掉任何'燃'感)
    def heartbeat(t0, vol):
        s0, s1 = int(t0 * SR), min(n, int((t0 + 0.45) * SR))
        for j in range(s0, s1):
            t = j / SR - t0
            mix[j] += math.sin(2 * math.pi * (52 - 22 * t) * t) * math.exp(-5.5 * t) * vol
    for bar in range(N_BARS):
        t0 = bar * BAR
        heartbeat(t0, 0.34)              # 第1拍重
        heartbeat(t0 + 2 * BEAT, 0.22)   # 第3拍(心跳第二声, 稍弱)
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
print(f'boss_bgm.wav  时长{TOTAL:.1f}s  {os.path.getsize(path)//1024}KB  BPM={BPM}  D小调踏板窒息压迫')
