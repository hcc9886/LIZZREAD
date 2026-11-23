# -*- coding: utf-8 -*-
"""把短篇集 / 诗集加入各语言书库（去重；GB 号来自 Gutenberg 目录）"""
import csv, json, re, os

rows = list(csv.DictReader(open('/tmp/pg_catalog.csv', encoding='utf-8', errors='replace')))
by_gb = {int(r['Text#']): r for r in rows if (r['Text#'] or '').strip().isdigit() and r['Type']=='Text'}

# 精选短篇/诗集：GB号, 中文名, 英文名(可空), 等级, 类型, 简介
PICKS = {
 'en': [
  (21,'伊索寓言三百则','Three Hundred Aesop\'s Fables','A1','fab','短小的寓言，A1 起步首选。'),
  (28,'伊索寓言','The Fables of Aesop','A1','fab','另一版英译伊索寓言。'),
  (142,'三十万元遗产及其他故事','The $30,000 Bequest, and Other Stories','B1','hum','马克·吐温短篇集。'),
  (160,'觉醒及其他短篇','The Awakening, and Selected Short Stories','B1','lit','凯特·肖邦的短篇精选。'),
  (243,'伪证券及其他故事','The Forged Coupon, and Other Stories','B2','lit','托尔斯泰短篇集。'),
  (294,'北极星号船长及其他故事','The Captain of the Polestar, and Other Tales','B2','mys','柯南·道尔短篇集。'),
  (295,'伊迪丝·华顿早期短篇（一）','The Early Short Fiction of Edith Wharton — Part 1','B2','lit','华顿早期短篇上卷。'),
  (306,'伊迪丝·华顿早期短篇（二）','The Early Short Fiction of Edith Wharton — Part 2','B2','lit','华顿早期短篇下卷。'),
  (344,'快乐的人及其他故事','The Merry Men, and Other Tales and Fables','B2','fab','史蒂文森短篇与寓言。'),
  (346,'木偶花园及其他短篇','The Troll Garden, and Selected Stories','B2','lit','薇拉·凯瑟短篇集。'),
  (109,'新生及其他诗','Renascence, and Other Poems','C1','poe','米莱诗集，普利策奖作品。'),
  (136,'儿童诗园','A Child\'s Garden of Verses','A2','poe','史蒂文森童诗集，短句易读。'),
  (207,'育空之咒及其他诗','The Spell of the Yukon and Other Verses','B2','poe','北方荒野诗集。'),
  (262,'鲁伯特·布鲁克诗集','The Collected Poems of Rupert Brooke','C1','poe','一战诗人布鲁克全集。'),
  (323,'吉卜林诗集','Verses 1889-1896','C1','poe','吉卜林早期诗作。'),
  (106,'人猿泰山的故事','Jungle Tales of Tarzan','B1','adv','泰山系列短篇。'),
  (163,'花的寓言','Flower Fables','A2','fab','《小妇人》作者写的童话。'),
 ],
 'de': [],
 'fr': [],
 'it': [],
 'es': [],
}

def classify(title, subjects):
    s = (title + ' ' + (subjects or '')).lower()
    if 'fable' in s or 'märchen' in s or 'conte' in s or 'fiabe' in s or 'cuento' in s: return 'fab'
    if 'poem' in s or 'gedicht' in s or 'poésie' in s or 'poesie' in s or 'verso' in s: return 'poe'
    if 'story' in s or 'tales' in s or 'short' in s: return 'lit'
    return 'lit'

def author(a):
    parts = [p.strip() for p in (a or '').split(';')[0].split(',')]
    parts = [p for p in parts if not re.match(r'^\d{3,4}', p)]
    return (parts[0] if parts else '佚名')[:40]

def clean_title(t):
    return re.sub(r'\s+', ' ', t).strip()[:120]

def build(code, picks):
    fn = f'data/lang-{code}.js'
    s = open(fn, encoding='utf-8').read()
    m = re.search(r'=\s*(\[.*\])\s*;?\s*$', s, re.S)
    arr = json.loads(m.group(1))
    have = {b.get('gb') for b in arr}
    added = 0
    for item in picks:
        gb = item[0]
        if gb in have or gb not in by_gb: continue
        r = by_gb[gb]
        title = item[1] if len(item) > 1 else clean_title(r['Title'])
        en = item[2] if len(item) > 2 else ''
        lv = item[3] if len(item) > 3 else 'B2'
        g = item[4] if len(item) > 4 else classify(r['Title'], r['Subjects'])
        d = item[5] if len(item) > 5 else ''
        arr.insert(0, dict(gb=gb, t=title, zh=title, en=en, a=author(r['Authors']), y=0,
                           lv=lv, g=g, d=d, fs=0, demo=[]))
        have.add(gb); added += 1
    open(fn, 'w', encoding='utf-8').write('window.LZ_LANG_' + code.upper() + ' = ' +
        json.dumps(arr, ensure_ascii=False, separators=(',', ':')) + ';')
    print(code, 'added', added, 'total', len(arr))

# 英语书库在 data/books-en.js（window.LZ_BOOKS_EN）
fn = 'data/books-en.js'
src = open(fn, encoding='utf-8').read()
m = re.search(r'window\.LZ_BOOKS_EN\s*=\s*(\[[\s\S]*\])\s*;?\s*$', src)
arr = json.loads(m.group(1))
have = {b.get('gb') for b in arr}
added = 0
for item in PICKS['en']:
    gb = item[0]
    if gb in have or gb not in by_gb: continue
    r = by_gb[gb]
    title = item[1]; en = item[2]; lv = item[3]; g = item[4]; d = item[5]
    arr.insert(0, dict(id='pg'+str(gb), t=en or clean_title(r['Title']), zh=title, a=author(r['Authors']),
                       y=0, lv=lv, g=g, gb=gb, d=d, src='pg'))
    have.add(gb); added += 1
open(fn, 'w', encoding='utf-8').write('/* 英语学习模式书库（手工双语书目 + 精选短篇/诗集） */\nwindow.LZ_BOOKS_EN = ' +
    json.dumps(arr, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('en added', added, 'total', len(arr))
