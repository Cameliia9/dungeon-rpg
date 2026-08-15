# -*- coding: utf-8 -*-
"""批量转换 assets/sfx 的 WAV → MP3(96kbps 22050Hz mono)并删除 WAV
用途: 主包体积超限(真机调试 80051: 5650KB > 4MB)后, 音频全部改 MP3。
gen_*.py 重新生成音效后, 运行本脚本再转回 MP3:
    python tools/convert_mp3.py
依赖: ffmpeg 在 PATH 中
"""
import os, subprocess, sys

SRC = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))

def main():
    wavs = sorted(f for f in os.listdir(SRC) if f.endswith('.wav'))
    if not wavs:
        print('没有 .wav 需要转换')
        return
    total_in = total_out = 0
    for name in wavs:
        src = os.path.join(SRC, name)
        out = os.path.join(SRC, name[:-4] + '.mp3')
        total_in += os.path.getsize(src)
        r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src,
                            '-b:a', '96k', '-ar', '22050', '-ac', '1', out])
        if r.returncode != 0:
            print(f'✗ 转换失败: {name}')
            sys.exit(1)
        total_out += os.path.getsize(out)
        os.remove(src)
        print(f'ok: {name[:-4]}.mp3')
    print(f'\n完成: {len(wavs)} 个, {total_in//1024}KB → {total_out//1024}KB')

if __name__ == '__main__':
    main()
