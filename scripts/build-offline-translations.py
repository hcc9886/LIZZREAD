# -*- coding: utf-8 -*-
"""生成离线翻译包 data/offline-tr.js
来源（全部本地已有）：
  1) sentences/*.json 里已有的句子中文
  2) i18n.js 里各语言 UI 文案的中文对照（短语级）
产出：window.LZ_OFFTR = {"<源文>": {"zh": "<译文>"}}，只收录中文，体积可控。
"""
import json, os, glob, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
table = {}

# 1) 句子包
n_sent = 0
for path in glob.glob(os.path.join(ROOT, 'sentences', '*.json')):
    try:
        data = json.load(open(path, encoding='utf-8'))
    except Exception:
        continue
    arr = data if isinstance(data, list) else data.get('sentences', [])
    for s in arr:
        text = (s.get('text') or '').strip()
        zh = (s.get('zh') or '').strip()
        # 只收整句（短句更常用、体积也小），跳过段落级超长文本
        if text and zh and zh != text and len(text) <= 220:
            table[text] = {'zh': zh}
            n_sent += 1

# 2) i18n 里的 UI 短语（从中文界面取对照）
i18n_path = os.path.join(ROOT, 'data', 'i18n.js')
src = open(i18n_path, encoding='utf-8').read()
m = re.search(r'window\.LZ_MIX\s*=\s*(\{.*\})\s*;?\s*$', src, re.S)
n_ui = 0
if m:
    try:
        mix = json.loads(m.group(1))
    except Exception:
        mix = {}
    zh_ui = (mix.get('zh') or {}).get('ui') or {}
    def walk(node, path=''):
        """把其它语言的 UI 值与中文 UI 的同路径值配对"""
        for code, pack in mix.items():
            if code == 'zh':
                continue
            other = (pack or {}).get('ui') or {}
            for key, val in _flatten(other).items():
                zh_val = zh_ui
                for seg in key.split('.'):
                    if isinstance(zh_val, dict):
                        zh_val = zh_val.get(seg)
                    else:
                        zh_val = None
                        break
                if isinstance(val, str) and isinstance(zh_val, str) and val.strip() and zh_val.strip():
                    if val.strip() not in table:
                        table[val.strip()] = {'zh': zh_val.strip()}
    def _flatten(obj, prefix=''):
        out = {}
        for k, v in (obj or {}).items():
            key = f'{prefix}.{k}' if prefix else k
            if isinstance(v, dict):
                out.update(_flatten(v, key))
            elif isinstance(v, str):
                out[key] = v
        return out
    walk(zh_ui)
    n_ui = len(table) - n_sent

out_path = os.path.join(ROOT, 'data', 'offline-tr.js')
payload = json.dumps(table, ensure_ascii=False, separators=(',', ':'))
open(out_path, 'w', encoding='utf-8').write(
    '/* 离线翻译包：句子 + 界面短语，由 scripts/build-offline-translations.py 生成 */\n'
    'window.LZ_OFFTR=' + payload + ';\n')
print(f'句子 {n_sent} 条，界面短语 {n_ui} 条，合计 {len(table)} 条')
print(f'输出 {out_path}  {os.path.getsize(out_path)/1024:.0f} KB')
