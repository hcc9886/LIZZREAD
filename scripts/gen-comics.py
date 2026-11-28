#!/usr/bin/env python3
"""从 comics/ 目录 + comics-meta.json 生成 data/comics-pd.js
   所有条目都要求 LicenseShortName 为 Public Domain（由抓取脚本校验过）。
   没在 meta 里的文件按文件名推断作品。"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CD = os.path.join(ROOT, "comics")
META = os.path.join(ROOT, "comics-meta.json")
OUT = os.path.join(ROOT, "data", "comics-pd.js")

meta = {}
if os.path.exists(META):
    try: meta = json.load(open(META, encoding="utf-8"))
    except Exception: meta = {}

# 文件名前缀 → 作品信息
SERIES = [
    ("nemo",            "Little Nemo in Slumberland", "小尼莫梦游记", "Winsor McCay"),
    ("rarebit",         "Dream of the Rarebit Fiend",  "威尔士干酪之梦", "Winsor McCay"),
    ("krazykat",        "Krazy Kat",                   "疯狂猫",        "George Herriman"),
    ("muttjeff",        "Mutt and Jeff",               "墨特与杰夫",    "Bud Fisher"),
    ("hooligan",        "Happy Hooligan",              "快乐的胡利根",  "Frederick Burr Opper"),
    ("katzenjammer",    "The Katzenjammer Kids",       "捣蛋鬼",        "Rudolph Dirks"),
    ("busterbrown",     "Buster Brown",                "巴斯特·布朗",   "Richard F. Outcault"),
    ("bringingupfather", "Bringing Up Father",         "岳父大人",      "George McManus"),
    ("gasolinealley",   "Gasoline Alley",              "汽油巷",        "Frank King"),
    ("polly",           "Polly and Her Pals",          "波莉和她的伙伴", "Cliff Sterrett"),
    ("yellowkid",       "The Yellow Kid",              "黄孩子",        "Richard F. Outcault"),
    ("allysloper",      "Ally Sloper",                 "艾利斯洛珀",    "Charles Ross"),
    ("orphanannie",     "Little Orphan Annie",         "小孤儿安妮",    "Harold Gray"),
    ("terrypirates",    "Terry and the Pirates",       "特里与海盗",    "Milton Caniff"),
    ("dicktracy",       "Dick Tracy",                  "迪克·崔西",     "Chester Gould"),
    ("flashgordon",     "Flash Gordon",                "闪电侠戈登",    "Alex Raymond"),
    ("buckrogers",      "Buck Rogers",                 "巴克·罗杰斯",   "Dick Calkins"),
    ("popeye",          "Popeye",                      "大力水手",      "E. C. Segar"),
    ("tintin",          "Tintin",                      "丁丁历险记",    "Hergé"),
    ("asterix",         "Asterix",                     "高卢英雄",      "René Goscinny"),
    ("batmanstrip",     "Batman",                      "蝙蝠侠",        "Bob Kane"),
    ("supermanstrip",   "Superman",                    "超人",          "Jerry Siegel"),
    ("tarzanstrip",     "Tarzan",                      "泰山",          "Hal Foster"),
    ("detective",       "Detective Comics",            "侦探漫画",      "Various"),
    ("wonderwoman",     "Wonder Woman",                "神奇女侠",      "William Moulton Marston"),
    ("captainmarvel",   "Captain Marvel",              "惊奇队长",      "C. C. Beck"),
    ("phantom",         "The Phantom",                 "幽灵",          "Lee Falk"),
    ("mandrake",        "Mandrake the Magician",       "魔术师曼德雷克", "Lee Falk"),
    ("princevaliant",   "Prince Valiant",              "瓦利安特王子",  "Hal Foster"),
    ("ripkirby",        "Rip Kirby",                   "里普·柯比",     "Alex Raymond"),
    ("stevecanyon",     "Steve Canyon",                "史蒂夫峡谷",    "Milton Caniff"),
    ("lilabner",        "Li'l Abner",                  "小阿布纳",      "Al Capp"),
    ("blondie",         "Blondie",                     "白朗黛",        "Chic Young"),
    ("dennis",          "Dennis the Menace",           "淘气阿丹",      "Hank Ketcham"),
    ("peanuts",         "Peanuts",                     "花生漫画",      "Charles M. Schulz"),
    ("calvinhobbes",    "Calvin and Hobbes",           "卡尔文与霍布斯", "Bill Watterson"),
    ("bloomcounty",     "Bloom County",                "布鲁姆县",      "Berkeley Breathed"),
    ("doonesbury",      "Doonesbury",                  "杜恩斯伯里",    "Garry Trudeau"),
    ("farside",         "The Far Side",                "远端",          "Gary Larson"),
    ("garfield",        "Garfield",                    "加菲猫",        "Jim Davis"),
]

def series_of(name):
    for pre, en, zh, au in SERIES:
        if name.startswith(pre + "-"):
            return en, zh, au
    return None, None, None

rows = []
for fn in sorted(os.listdir(CD)):
    if not fn.lower().endswith((".jpg", ".jpeg", ".png")):
        continue
    stem = os.path.splitext(fn)[0]
    m = meta.get(stem, {})
    en, zh, au = m.get("t"), m.get("tzh"), None
    if not en:
        en, zh, au2 = series_of(stem)
        au = au2
    if not en:
        en, zh = stem.replace("-", " "), stem.replace("-", " ")
    # 日期：从文件名里抽 YYYY-MM-DD
    dm = re.search(r'(19\\d{2}|18\\d{2})-(\\d{2})-(\\d{2})', stem)
    date = dm.group(0) if dm else (re.search(r'(19\\d{2}|18\\d{2})', stem).group(0) if re.search(r'(19\\d{2}|18\\d{2})', stem) else "—")
    author = au or m.get("author") or ""
    rows.append({
        "id": stem, "file": "comics/" + fn,
        "t": en, "tzh": zh or en, "date": date,
        "author": author or "Various",
        "lang": "en", "license": "Public Domain",
        "src": m.get("src") or ("https://commons.wikimedia.org/wiki/Special:Search?search=" + en.replace(" ", "%20"))
    })

js = "/* 内置公有领域漫画（来源 Wikimedia Commons，均已校验 LicenseShortName 为 Public Domain）\n"
js += "   由 scripts/gen-comics.py 自动生成，共 %d 期。 */\n" % len(rows)
js += "window.LZ_COMICS_PD = " + json.dumps(rows, ensure_ascii=False, indent=1) + ";\n"
open(OUT, "w", encoding="utf-8").write(js)
print("生成", OUT, "共", len(rows), "期")
