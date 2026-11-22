# -*- coding: utf-8 -*-
"""Build data/lang-<code>.js — per-language catalogs for LIZZREAD.
Source: /tmp/pg_catalog.csv (Gutenberg). For languages with few Gutenberg books,
extra curated entries (gb id or 'src' url) are appended.
"""
import csv, json, re, sys, os, collections

CAT = '/tmp/pg_catalog.csv'
OUT_DIR = 'data'
rows = list(csv.DictReader(open(CAT, encoding='utf-8', errors='replace')))

def classify(r):
    sh = (r['Bookshelves'] or '').lower(); sub = (r['Subjects'] or '').lower()
    has = lambda *k: any(x in sh or x in sub for x in k)
    if has('science-fiction','fantasy','phantastisch','science fiction'): return 'sci'
    if has('crime','thriller','mystery','detective','krimi','policier'): return 'mys'
    if has('fairy','fable','mythology','legend','folklore','märchen','conte','favola','japanese','日本'): return 'fab'
    if has('plays','drama','theatre','theater','théâtre','comédie','dramma'): return 'drama'
    if has('poetry','poems','verse','poesie','gedicht','poésie','poesia'): return 'poe'
    if has('fiction','novels','literature','roman','romanzo','romance'): return 'lit'
    if has('history','biograph','mémoir','histoire','historisch','storia'): return 'his'
    if has('philosophy','religion','philosophie','philosophie','filosofia'): return 'phl'
    return 'lit'

def norm_title(t):
    t = re.sub(r'\s+', ' ', t or '').strip()
    t = re.sub(r'\s*[\[(](illustrated|complete|with .*?)[\])]$', '', t, flags=re.I)
    return t[:160]

def author_clean(a):
    a = (a or '').split(';')[0].strip()
    parts = [p.strip() for p in a.split(',') if p.strip()]
    parts = [p for p in parts if not re.match(r'^\d{3,4}(-\d{3,4})?$', p) and not re.match(r'^(c\.|ca\.)?\s*\d{3,4}', p)]
    if len(parts) >= 2:
        return (parts[1] + ' ' + parts[0]).replace('  ', ' ').strip()
    return a[:80]

LANGS = {
  'en': dict(name='English', native='English', zh='英语', lvLabel='CEFR A1-C2',
             levels=['A1','A2','B1','B2','C1','C2'], quota=120, tgt='zh-CN'),
  'de': dict(name='German', native='Deutsch', zh='德语', lvLabel='CEFR A1-C2',
             levels=['A1','A2','B1','B2','C1','C2'], quota=40, tgt='zh-CN'),
  'fr': dict(name='French', native='Français', zh='法语', lvLabel='CEFR A1-C2',
             levels=['A1','A2','B1','B2','C1','C2'], quota=40, tgt='zh-CN'),
  'it': dict(name='Italian', native='Italiano', zh='意大利语', lvLabel='CEFR A1-C2',
             levels=['A1','A2','B1','B2','C1','C2'], quota=40, tgt='zh-CN'),
  'es': dict(name='Spanish', native='Español', zh='西班牙语', lvLabel='CEFR A1-C2',
             levels=['A1','A2','B1','B2','C1','C2'], quota=30, tgt='zh-CN'),
  'ja': dict(name='Japanese', native='日本語', zh='日语', lvLabel='JLPT N5-N1',
             levels=['N5','N4','N3','N2','N1'], quota=25, tgt='zh-CN'),
  'ko': dict(name='Korean', native='한국어', zh='韩语', lvLabel='TOPIK 1-6',
             levels=['1','2','3','4','5','6'], quota=25, tgt='zh-CN'),
}

# 每语言旗舰书（Gutenberg 编号）—— 先放前面，保证置顶
FLAGSHIP = {
  'de': [2229, 24264, 2037, 24966, 2227, 24698, 27395, 65134, 24196, 7205, 24263, 17575, 49824, 28810],
  'fr': [17489, 17989, 13846, 6087, 1497, 17492, 14163, 12564, 17491, 12371, 815, 13109],
  'it': [1012, 1429, 21014, 31500, 26605, 2788, 35238, 41616],
  'es': [2000, 10236, 16245, 5032, 12721, 10827, 43589],
}
# 日文/韩文：青空文库/其他公版源（无 Gutenberg 编号，运行时按需抓取）
JA_EXTRA = [
  ("rg02_037.txt", "吾輩は猫である", "夏目 漱石", 1905, "ふab", "N3"),
]
# 日文：青空文库作品（id, 原名, 作者, 年份, 风格, 级别）
AOZORA = [
  ("rg02_037", "吾輩は猫である", "夏目漱石", 1905, "lit", "N3"),
  ("rg43_037", "こころ", "夏目漱石", 1914, "lit", "N3"),
  ("rg41_005", "走れメロス", "太宰治", 1940, "lit", "N3"),
  ("rg40_189", "人間失格", "太宰治", 1948, "lit", "N2"),
  ("rg01_155", "羅生門", "芥川龍之介", 1915, "lit", "N2"),
  ("rg01_081", "地獄変", "芥川龍之介", 1918, "lit", "N2"),
  ("rg03_211", "銀河鉄道の夜", "宮沢賢治", 1934, "fab", "N3"),
  ("rg02_018", "注文の多い料理店", "宮沢賢治", 1924, "fab", "N3"),
  ("rg01_009", "雪国", "川端康成", 1948, "lit", "N1"),
  ("rg13_015", "坊っちゃん", "夏目漱石", 1906, "lit", "N3"),
  ("rg12_076", "斜陽", "太宰治", 1947, "lit", "N2"),
  ("rg21_017", "袖中抄", "鴨長明", 1200, "poe", "N1"),
  ("rg46_001", "源氏物語", "紫式部", 1008, "lit", "N1"),
  ("rg05_117", "伊勢物語", "佚名", 900, "poe", "N1"),
  ("rg08_001", "古事記", "太安万侶", 712, "his", "N1"),
  ("rg36_013", "枕草子", "清少納言", 1000, "lit", "N1"),
  ("rg53_001", "日本の童話", "佚名", 1900, "fab", "N4"),
  ("rg75_001", "竹取物語", "佚名", 900, "fab", "N2"),
]
# 韩文：公版韩文作品（朝鲜王朝古典 + 近代公版），Gutenberg 没有，走自备/代理
KO_EXTRA = [
  ("훈민정음", "訓民正音", "世宗大王", 1446, "his", "3"),
  ("용비어천가", "龍飛御天歌", " 세종", 1447, "poe", "4"),
  ("홍길동전", "洪吉童傳", "許筠", 1600, "lit", "3"),
  ("춘향전", "春香傳", "佚名", 1700, "lit", "3"),
  ("심청전", "沈清傳", "佚名", 1700, "fab", "3"),
  ("흥부전", "興夫傳", "佚名", 1700, "fab", "3"),
  ("토끼전", "兎廛傳", "佚名", 1700, "fab", "3"),
  ("구운몽", "九雲夢", "金萬重", 1689, "lit", "4"),
  ("사씨남정기", "謝氏南征記", "金萬重", 1689, "lit", "4"),
  ("운영전", "雲英傳", "佚名", 1700, "lit", "4"),
  ("김영철전", "金英哲傳", "佚名", 1700, "his", "4"),
  ("한중록", "恨中錄", "惠慶宮洪氏", 1795, "his", "5"),
  ("무정", "無情", "李光洙", 1917, "lit", "3"),
  ("창가의 사계", "歌辭", "佚名", 1700, "poe", "5"),
]

def build(code, cfg):
    base = [r for r in rows if r['Type'] == 'Text' and r['Language'] == code
            and (r['Text#'] or '').strip().isdigit() and (r['Title'] or '').strip()]
    out, seen = [], set()
    def add(entry, gb=None, flagship=False):
        key = (entry['t'].lower(), entry['a'].lower())
        if key in seen: return
        seen.add(key)
        entry['fs'] = 1 if flagship else 0
        out.append(entry)
    # 置顶旗舰书
    for gb in FLAGSHIP.get(code, []):
        hit = next((r for r in base if int(r['Text#']) == gb), None)
        if hit:
            add(dict(gb=gb, t=norm_title(hit['Title']), a=author_clean(hit['Authors']),
                     g=classify(hit), lv=cfg['levels'][2]), gb, True)
    base.sort(key=lambda r: -len(r['Title'] or ''))
    for r in base:
        gb = int(r['Text#'])
        lv = cfg['levels'][2]
        add(dict(gb=gb, t=norm_title(r['Title']), a=author_clean(r['Authors']),
                 g=classify(r), lv=lv), gb)
    # 日文（无 gb，走青空文库 id）
    if code == 'ja':
        for aid, title, author, year, g, lv in AOZORA:
            add(dict(gb=0, az=aid, t=title, a=author, g=g, lv=lv, y=year), 0, True)
    if code == 'ko':
        for title, hanja, author, year, g, lv in KO_EXTRA:
            add(dict(gb=0, ko=title, hanja=hanja, t=title, a=author, g=g, lv=lv, y=year), 0, True)
    return out

if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = []
    for code, cfg in LANGS.items():
        if code == 'en':
            continue  # 英文沿用 data/catalog.js
        books = build(code, cfg)
        js = "window.LZ_LANG_" + code.upper() + " = " + json.dumps(books, ensure_ascii=False, separators=(',', ':')) + ";\n"
        open(os.path.join(OUT_DIR, 'lang-' + code + '.js'), 'w', encoding='utf-8').write(js)
        manifest.append(dict(code=code, **cfg, count=len(books)))
        print(code, len(books))
    # 生成 manifest（英文计数后面在浏览器里补）
    manifest.insert(0, dict(code='en', **LANGS['en'], count=0))
    open(os.path.join(OUT_DIR, 'lang-manifest.js'), 'w', encoding='utf-8').write(
        "window.LZ_LANGS = " + json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + ";\n")
    print('manifest ok')
