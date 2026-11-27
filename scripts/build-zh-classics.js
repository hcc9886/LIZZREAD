# -*- coding: utf-8 -*-
"""抓取古腾堡上的中文原著公版书（三国演义/红楼梦/西游记），生成 data/books-zh-classics.js"""
import json, os, re, urllib.request, ssl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PICKS = [
    (23950, '三國志演義', '罗贯中', 'C2'),
    (24264, '紅樓夢', '曹雪芹', 'C2'),
    (23962, '西遊記', '吴承恩', 'C1'),
]
MIRROR = "https://gutenberg.pglaf.org/cache/epub/%d/pg%d.txt"
ctx = ssl.create_default_context()
out = []
for gb, title, author, lv in PICKS:
    try:
        req = urllib.request.Request(MIRROR % (gb, gb), headers={'User-Agent': 'LIZZREAD-builder/1.0'})
        raw = urllib.request.urlopen(req, timeout=120, context=ctx).read().decode('utf-8', 'ignore')
    except Exception as e:
        print('跳过', gb, title, e); continue
    m = re.search(r'\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG.*?\*\*\*', raw, re.S)
    if m: raw = raw[m.end():]
    m2 = re.search(r'\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG', raw, re.S)
    if m2: raw = raw[:m2.start()]
    raw = raw.strip()
    words = raw.split()
    if len(words) > 15000: raw = ' '.join(words[:15000])
    raw = raw.replace('\r', '')
    out.append({'id': 'pg%d' % gb, 'gb': gb, 'lang': 'zh', 't': title, 'a': author,
                'lv': lv, 'g': 'lit', 'en': title, 'text': raw, 'chars': len(raw)})
    print('已收', gb, title, len(raw), '字符')

path = os.path.join(ROOT, 'data', 'books-zh-classics.js')
with open(path, 'w', encoding='utf-8') as f:
    f.write('/* 中文公版名著（古腾堡中文原著，前 15000 词） */\n')
    f.write('window.LZ_ZH_CLASSICS=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('完成：%d 本，%.1f MB' % (len(out), os.path.getsize(path) / 1048576))
