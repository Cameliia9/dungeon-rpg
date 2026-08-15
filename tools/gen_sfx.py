# -*- coding: utf-8 -*-
"""合成微信小游戏音效 + 8-bit BGM(WAV 16-bit 22050Hz 单声道)
音效: click/hit/crit/dodge/hurt/levelup/enhance/coin/victory/defeat/boss/bossatk
BGM: 8-bit 风格循环旋律
"""
import wave, math, struct, os, random

SR = 22050
# 输出到项目根 assets/sfx(脚本在 tools/ 下)
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))
os.makedirs(OUT, exist_ok=True)

def write_wav(name, samples, amp=0.8):
    path = os.path.join(OUT, name + '.wav')
    with wave.open(path, 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        data = b''.join(struct.pack('<h', max(-32767, min(32767, int(s * amp * 32767)))) for s in samples)
        w.writeframes(data)
    print(f'{name}.wav  {len(samples)/SR*1000:.0f}ms  {os.path.getsize(path)//1024}KB')

def silence(dur): return [0.0] * int(SR * dur)

def tone(freq, dur, vol=1.0, wave_type='sine', decay=1.0, slide_to=None):
    """生成单音: wave_type=sine/square/triangle/saw, decay=指数衰减系数"""
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        f = freq if slide_to is None else freq + (slide_to - freq) * (i / n)
        ph = 2 * math.pi * f * t
        if wave_type == 'sine': s = math.sin(ph)
        elif wave_type == 'square': s = 1.0 if math.sin(ph) >= 0 else -1.0
        elif wave_type == 'triangle': s = 2 * math.asin(math.sin(ph)) / math.pi
        else:  # saw
            s = 2 * (ph / (2 * math.pi) % 1.0) - 1.0
        env = math.exp(-decay * t) if decay > 0 else 1.0
        out.append(s * env * vol)
    return out

def seq(*parts): 
    out = []
    for p in parts: out.extend(p)
    return out

# ---------- 音效 ----------
# click: 清脆咔嗒(正弦1400→900下滑 + 2000Hz瞬态, 干净不刺耳; 迭代: 方波1500刺耳→三角波1000闷→本版)
write_wav('click', seq(tone(1400, 0.035, 0.45, 'sine', 55, 900), tone(2000, 0.02, 0.2, 'sine', 80)))

# hit: 中频打击(方波 + 噪声爆点)
hit_noise = [random.uniform(-1, 1) * math.exp(-60 * t) for t in [i / SR for i in range(int(SR * 0.08))]]
write_wav('hit', seq(tone(180, 0.12, 0.8, 'square', 18), hit_noise))

# crit: 金属打击(高谐波 + 更亮)
write_wav('crit', seq(tone(120, 0.06, 0.9, 'square', 25), tone(480, 0.15, 0.7, 'square', 12), tone(960, 0.10, 0.4, 'square', 15)))

# dodge: 嗖(滑音 500->1400)
write_wav('dodge', tone(500, 0.18, 0.5, 'sine', 8, slide_to=1400))

# hurt: 玩家受击(低沉噗)
write_wav('hurt', seq(tone(140, 0.15, 0.7, 'triangle', 14), tone(90, 0.08, 0.5, 'triangle', 16)))

# bounce: 果冻弹跳(快速上滑+轻微颤音, Q弹感; 三段衰减模拟duang~duang)
def jelly(f0, f1, dur, vol, vib):
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        f = f0 + (f1 - f0) * (i / n)
        wob = 1 + vib * math.sin(2 * math.pi * 22 * t)  # 果冻抖动
        env = math.exp(-9 * t)
        out.append(math.sin(2 * math.pi * f * wob * t) * env * vol)
    return out
write_wav('bounce', seq(jelly(240, 460, 0.08, 0.7, 0.05), jelly(460, 620, 0.06, 0.45, 0.06), jelly(620, 700, 0.05, 0.25, 0.07)))

# levelup: 欢快上行琶音 C5-E5-G5-C6
write_wav('levelup', seq(tone(523, 0.10, 0.6, 'square', 10), tone(659, 0.10, 0.6, 'square', 10), tone(784, 0.10, 0.6, 'square', 10), tone(1047, 0.25, 0.7, 'square', 6)))

# enhance: 清脆叮(高频双音)
write_wav('enhance', seq(tone(880, 0.12, 0.6, 'sine', 10), tone(1320, 0.20, 0.5, 'sine', 7)))

# coin: 金币叮铃(E6+B6 双音)
write_wav('coin', seq(tone(1319, 0.08, 0.5, 'sine', 12), tone(1976, 0.15, 0.45, 'sine', 9)))

# victory: 上扬 C5-E5-G5-C6(比levelup更亮更久)
write_wav('victory', seq(tone(523, 0.12, 0.6, 'square', 9), tone(659, 0.12, 0.6, 'square', 9), tone(784, 0.12, 0.6, 'square', 9), tone(1047, 0.35, 0.75, 'square', 5)))

# defeat: 低沉下行 E4-C4-A3-F3
write_wav('defeat', seq(tone(330, 0.18, 0.6, 'triangle', 7), tone(262, 0.18, 0.6, 'triangle', 7), tone(220, 0.25, 0.6, 'triangle', 6), tone(175, 0.4, 0.6, 'triangle', 4)))

# boss: 低频威胁(颤音)
n = int(SR * 0.5)
boss = []
for i in range(n):
    t = i / SR
    f = 110 + 15 * math.sin(2 * math.pi * 12 * t)
    env = math.exp(-4 * t)
    boss.append(math.sin(2 * math.pi * f * t) * env * 0.8)
write_wav('boss', boss)

# bossatk: Boss 攻击玩家重锤(迭代史: v1 85→50纯低频手机放不出 → v2 三角波太软 → v3.1 方波单音不够重
#   → v4 正弦叠加RMS低更轻 → v5.1 方波160满幅"尖锐" → v6 纯正弦"太闷" → v7 三角波叠层RMS又低
#   → v8 定稿: 方波+低通滤波=电子低音鼓thump: 响(-9.3dB) + 有厚度(中频-14.2不闷) + 不尖(>800Hz -28.3))
# v8 = 方波160Hz 0.34s慢衰减 → 20点移动平均低通(≈490Hz, 滤高次谐波) + 30ms弱噪声音头 + 110Hz三角短尾
def _bossatk_body():
    _b = tone(160, 0.34, 1.0, 'square', 5)
    _win = 20
    _acc = sum(_b[:_win]) / _win
    _out = [_acc]
    for _i in range(_win, len(_b)):
        _acc += (_b[_i] - _b[_i - _win]) / _win
        _out.append(_acc)
    _noise_n = int(SR * 0.03)
    for _i in range(_noise_n):
        _t = _i / SR
        _out[_i] += random.uniform(-1, 1) * math.exp(-60 * _t) * 0.18
    return _out
def _norm(samples, peak=0.95):
    _mx = max(1e-9, max(abs(s) for s in samples))
    _k = peak / _mx
    return [s * _k for s in samples]
write_wav('bossatk', _norm(seq(_bossatk_body(), tone(110, 0.08, 0.3, 'triangle', 7))))

# ---------- BGM: 8-bit 风格循环(约 13 秒) ----------
# 简单小调旋律: A4 C5 E5 G5 琶音 + 低音 A3
NOTE = {'A3': 220, 'C4': 262, 'D4': 294, 'E4': 330, 'G4': 392, 'A4': 440, 'C5': 523, 'E5': 659, 'G5': 784, 'A5': 880, 'R': 0}
melody = [
    'A4','C5','E5','C5','A4','E5','G5','E5',  # 8 小节乐句
    'A4','C5','E5','C5','G4','E5','A5','E5',
    'A4','C5','E5','C5','A4','E5','G5','E5',
    'C5','E5','A5','E5','C5','A4','G4','E4',
]
bass = ['A3','A3','A3','A3','E4','E4','E4','E4',
        'A3','A3','A3','A3','C4','C4','D4','D4',
        'A3','A3','A3','A3','E4','E4','E4','E4',
        'A3','A3','A3','A3','E4','E4','G4','G4']
step = 0.20  # 每音 0.2s => 32 音 = 6.4s 循环
bgm = []
for i in range(len(melody)):
    m = NOTE[melody[i]]
    b = NOTE[bass[i]]
    if m: bgm.extend(tone(m, step, 0.28, 'square', 2.2))
    else: bgm.extend(silence(step))
    if b: bgm.extend(tone(b, step, 0.20, 'triangle', 2.2))
    else: bgm.extend(silence(step))
write_wav('bgm', bgm, amp=0.55)

print(f'\n全部生成完毕 → {OUT}')
