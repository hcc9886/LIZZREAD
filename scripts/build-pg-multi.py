# -*- coding: utf-8 -*-
"""从古腾堡构建多语言公版短篇书库 data/books-pg-multi.js
只收公版作品（作者去世 70 年以上），来源 gutenberg.pglaf.org 镜像。"""
import sqlite3, json, re, os, urllib.request, ssl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = '/Users/hcc/Desktop/LIZZREAD/.sdk/android-home/.cache/pg.txt'  # 占位

# 直接用古腾堡的 gutindex 不现实，这里用固定 id 列表（人工挑选的公版短篇/中篇）
PICKS = [
    # (id, 语言, 书名, 作者, 等级)
    (84,   'en', 'Frankenstein', 'Mary Shelley', 'C1'),
    (1342, 'en', 'Pride and Prejudice', 'Jane Austen', 'B2'),
    (11,   'en', "Alice's Adventures in Wonderland", 'Lewis Carroll', 'B1'),
    (1661, 'en', 'The Adventures of Sherlock Holmes', 'Arthur Conan Doyle', 'B2'),
    (174,  'en', 'The Picture of Dorian Gray', 'Oscar Wilde', 'C1'),
    (2701, 'en', 'Moby Dick', 'Herman Melville', 'C2'),
    (1952, 'en', 'The Yellow Wallpaper', 'Charlotte Perkins Gilman', 'B2'),
    (5200, 'en', 'Metamorphosis', 'Franz Kafka', 'C1'),
    (98,   'en', 'A Tale of Two Cities', 'Charles Dickens', 'C1'),
    (46,   'en', 'A Christmas Carol', 'Charles Dickens', 'B1'),
]
MIRROR = "https://gutenberg.pglaf.org/cache/epub/%d/pg%d.txt"

ctx = ssl.create_default_context()
out = []
for pid, lang, title, author, lv in PICKS:
    url = MIRROR % (pid, pid)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'LIZZREAD-builder/1.0'})
        raw = urllib.request.urlopen(req, timeout=90, context=ctx).read().decode('utf-8', 'ignore')
    except Exception as e:
        print('跳过', pid, title, e); continue
    # 去掉古腾堡头尾
    m = re.search(r'\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG.*?\*\*\*', raw, re.S)
    if m: raw = raw[m.end():]
    m2 = re.search(r'\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG', raw, re.S)
    if m2: raw = raw[:m2.start()]
    raw = raw.strip()
    if len(raw) < 5000:
        print('太短跳过', pid); continue
    # 只留前 12000 词（够读，体积可控）
    words = raw.split()
    if len(words) > 12000: raw = ' '.join(words[:12000])
    raw = re.sub(r'\r', '', raw)
    out.append({
        'id': 'pg%d' % pid, 'gb': pid, 'lang': lang, 't': title, 'a': author,
        'lv': lv, 'g': 'lit', 'en': title, 'text': raw, 'chars': len(raw)
    })
    print('已收', pid, title, len(raw), '字符')

path = os.path.join(ROOT, 'data', 'books-pg-multi.js')
with open(path, 'w', encoding='utf-8') as f:
    f.write('/* 多语言公版书（古腾堡公版，含全文前 12000 词） */\n')
    f.write('window.LZ_PG_MULTI=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('完成：%d 本，%.1f MB' % (len(out), os.path.getsize(path)/1048576))

# ===== 追加：法语 / 德语 / 西班牙语 / 意大利语 公版 =====
EXTRA = [
    (17489, 'fr', 'Le Tour du monde en quatre-vingts jours', 'Jules Verne', 'B2'),
    (17989, 'fr', 'Les Misérables — Tome I', 'Victor Hugo', 'C1'),
    (1400,  'fr', 'Le Père Goriot', 'Honoré de Balzac', 'C1'),
    (158,  'de', 'Die Verwandlung', 'Franz Kafka', 'C1'),
    (2229, 'de', 'Faust — Der Tragödie erster Teil', 'Johann Wolfgang von Goethe', 'C2'),
    (1969, 'de', 'Die Leiden des jungen Werther', 'Johann Wolfgang von Goethe', 'C1'),
    (2000, 'es', 'Don Quijote de la Mancha', 'Miguel de Cervantes', 'C2'),
    (49836,'es', 'Cuentos de la selva', 'Horacio Quiroga', 'B1'),
    (29530,'it', 'I Promessi Sposi', 'Alessandro Manzoni', 'C2'),
    (22413,'it', 'Le avventure di Pinocchio', 'Carlo Collodi', 'B1'),
    (23919,'pt', 'Os Maias', 'José Maria de Eça de Queirós', 'C2'),
    (17557,'nl', 'De kleine Johannes', 'Frederik van Eeden', 'B2'),
]
out2 = []
for pid, lang, title, author, lv in EXTRA:
    url = MIRROR % (pid, pid)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'LIZZREAD-builder/1.0'})
        raw = urllib.request.urlopen(req, timeout=90, context=ctx).read().decode('utf-8', 'ignore')
    except Exception as e:
        print('跳过', pid, title, e); continue
    m = re.search(r'\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG.*?\*\*\*', raw, re.S)
    if m: raw = raw[m.end():]
    m2 = re.search(r'\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG', raw, re.S)
    if m2: raw = raw[:m2.start()]
    raw = raw.strip()
    if len(raw) < 5000:
        print('太短跳过', pid); continue
    words = raw.split()
    if len(words) > 12000: raw = ' '.join(words[:12000])
    raw = re.sub(r'\r', '', raw)
    out2.append({'id': 'pg%d' % pid, 'gb': pid, 'lang': lang, 't': title, 'a': author,
                 'lv': lv, 'g': 'lit', 'en': title, 'text': raw, 'chars': len(raw)})
    print('已收', pid, title, len(raw), '字符')

if out2:
    path2 = os.path.join(ROOT, 'data', 'books-pg-multi2.js')
    with open(path2, 'w', encoding='utf-8') as f:
        f.write('/* 多语言公版书（法/德/西/意/葡/荷） */\n')
        f.write('window.LZ_PG_MULTI2=' + json.dumps(out2, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('第二包：%d 本，%.1f MB' % (len(out2), os.path.getsize(path2)/1048576))
