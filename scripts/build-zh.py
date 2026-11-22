# -*- coding: utf-8 -*-
"""生成 data/lang-zh.js —— 汉语学习模式书库（Gutenberg 中文原典，带通行英译名与 HSK 分级）"""
import csv, json, re, collections

CAT='/tmp/pg_catalog.csv'
rows=list(csv.DictReader(open(CAT,encoding='utf-8',errors='replace')))
by_gb={}
by_title={}
for r in rows:
    if r['Type']!='Text' or r['Language']!='zh': continue
    if not (r['Text#'] or '').strip().isdigit(): continue
    gb=int(r['Text#'])
    by_gb[gb]=r
    by_title.setdefault((r['Title'] or '').strip(), gb)

# 精选：中文名, 通行英译, 作者, 年份, HSK, 类型, 简介
FLAGS=[
 ('紅樓夢','Dream of the Red Chamber','曹雪芹',1791,'HSK6','lit','中国古典小说巅峰，四大家族兴衰。'),
 ('水滸傳','Water Margin','施耐庵',1400,'HSK6','lit','一百零八位好汉聚义梁山。'),
 ('西遊記','Journey to the West','吴承恩',1592,'HSK5','fab','唐僧师徒西天取经的奇幻长旅。'),
 ('三國志演義','Romance of the Three Kingdoms','罗贯中',1522,'HSK6','his','魏蜀吴三国的政治与战争。'),
 ('儒林外史','The Scholars','吴敬梓',1750,'HSK6','hum','清代科举士人的讽刺长卷。'),
 ('鏡花緣','Flowers in the Mirror','李汝珍',1828,'HSK6','fab','海外奇国游记与女性才学。'),
 ('老殘遊記','The Travels of Lao Can','刘鹗',1907,'HSK5','lit','晚清社会见闻与山水游记。'),
 ('孽海花','A Flower in a Sinful Sea','曾朴',1905,'HSK6','lit','晚清士大夫的社会小说。'),
 ('官場現形記','Officialdom Unmasked','李伯元',1903,'HSK6','hum','晚清官场百态的讽刺小说。'),
 ('二十年目睹之怪現狀','Odd Tales of Twenty Years','吴趼人',1910,'HSK6','hum','晚清社会怪现状的实录体小说。'),
 ('徬徨','Wandering','鲁迅',1926,'HSK5','lit','现代短篇小说集，含《祝福》《伤逝》。'),
 ('歐遊雜記','Travel Notes in Europe','朱自清',1934,'HSK4','adv','欧洲十城游记，文字清丽。'),
 ('斷鴻零雁記','The Lone Swan','苏曼殊',1912,'HSK5','rom','近代第一本自传体爱情小说。'),
 ('恨海','The Sea of Regret','吴趼人',1906,'HSK5','rom','庚子事变中的离散爱情。'),
 ('情變','The Change of Heart','吴趼人',1910,'HSK5','rom','新旧交替时代的婚恋悲剧。'),
 ('九命奇冤','The Strange Case of Nine Lives','吴趼人',1906,'HSK5','mys','清代冤案的推理式叙事。'),
 ('胡涂世界','The Muddled World','吴趼人',1906,'HSK5','hum','晚清社会的讽刺短篇。'),
 ('論語','The Analects','孔子',-479,'HSK4','phl','孔门言行的语录体经典。'),
 ('老子','Tao Te Ching','老子',-400,'HSK5','phl','五千言的东方哲学源头。'),
 ('孟子','Mencius','孟子',-300,'HSK5','phl','仁政与性善的政治哲学。'),
 ('韩非子','Han Feizi','韩非',-233,'HSK6','phl','法家集大成的政治学说。'),
 ('墨子','Mozi','墨子',-400,'HSK6','phl','兼爱非攻的墨家经典。'),
 ('文子','Wenzi','辛钘',-400,'HSK6','phl','道家遗文与宇宙论。'),
 ('淮南子','Huainanzi','刘安',-139,'HSK6','phl','汉代杂家与宇宙论。'),
 ('明夷待訪錄','Waiting for the Dawn','黄宗羲',1663,'HSK6','phl','中国最早的民本政治论。'),
 ('菜根譚','Caigentan','洪应明',1596,'HSK4','phl','处世格言集，短句易读。'),
 ('弟子規','Standards for Being a Good Pupil','李毓秀',1701,'HSK3','phl','童蒙行为规范，三字一句。'),
 ('三字經','Three Character Classic','王应麟',1270,'HSK2','phl','三字一句的识字启蒙经典。'),
 ('千字文','Thousand Character Classic','周兴嗣',520,'HSK3','phl','一千个不重复汉字写成的小书。'),
 ('孝經','Classic of Filial Piety','佚名',-400,'HSK4','phl','孝道的经典阐述。'),
 ('近思錄','Reflections on Things at Hand','朱熹',1175,'HSK6','phl','理学入门读本。'),
 ('顔氏家訓','The Family Instructions of Master Yan','颜之推',590,'HSK6','phl','传世家训与处世智慧。'),
 ('詩經','The Classic of Poetry','佚名',-600,'HSK5','poe','305 首先秦诗歌总集。'),
 ('東坡樂府','Dongpo Ci-Poems','苏轼',1080,'HSK5','poe','苏轼词集，豪放词宗。'),
 ('辛棄疾詞選','Selected Ci of Xin Qiji','辛弃疾',1190,'HSK5','poe','稼轩词选，豪放与沉郁并见。'),
 ('花間集','Among the Flowers','赵崇祚',940,'HSK5','poe','中国第一部文人词集。'),
 ('李太白集','Poems of Li Bai','李白',760,'HSK5','poe','诗仙李白的诗文集。'),
 ('人間詞話','Poetic Remarks in the Human World','王国维',1908,'HSK5','poe','境界说的词学经典。'),
 ('史記','Records of the Grand Historian','司马迁',-90,'HSK6','his','纪传体通史的奠基之作。'),
 ('左傳','Zuo Tradition','左丘明',-400,'HSK6','his','编年体史书与叙事典范。'),
 ('漢書','Book of Han','班固',82,'HSK6','his','西汉一朝的正史。'),
 ('宋史','History of Song','脱脱',1346,'HSK6','his','二十四史之一。'),
 ('東京夢華錄','Dream of the Eastern Capital','孟元老',1147,'HSK5','his','北宋汴京的城市生活志。'),
 ('列女傳','Biographies of Exemplary Women','刘向',-20,'HSK6','his','古代女性传记集。'),
 ('高士傳','Biographies of High-Minded Men','皇甫谧',270,'HSK6','his','隐士传记集。'),
 ('星槎勝覽','Triumphant Voyages of the Star Raft','费信',1436,'HSK6','adv','郑和船队的海外见闻。'),
 ('瀛涯勝覽','Overall Survey of the Ocean Shores','马欢',1451,'HSK6','adv','随郑和下西洋的实录。'),
 ('傷寒論','Treatise on Cold Damage','张仲景',220,'HSK6','phl','中医临床经典。'),
 ('閱微草堂筆記','Notes of the Yuewei Hermitage','纪昀',1800,'HSK6','fab','志怪笔记，与聊斋并称。'),
 ('西廂記','Romance of the Western Chamber','王实甫',1300,'HSK5','drama','元杂剧爱情名作。'),
 ('桃花扇','Peach Blossom Fan','孔尚任',1699,'HSK6','drama','明清易代的爱情历史剧。'),
 ('封神演義','Investiture of the Gods','许仲琳',1560,'HSK6','fab','商周神话与封神体系。'),
 ('警世通言','Stories to Caution the World','冯梦龙',1624,'HSK5','lit','三言之一，白话短篇。'),
 ('醒世恆言','Stories to Awaken the World','冯梦龙',1627,'HSK5','lit','三言之一，市井人情。'),
 ('二刻拍案惊奇','Second Collection of Amazing Tales','凌濛初',1632,'HSK6','lit','二拍之一，白话公案。'),
 ('隋唐演義','Romance of Sui and Tang','褚人获',1695,'HSK5','his','隋末唐初的历史演义。'),
 ('夢中緣','Dream Union','李修行',1715,'HSK5','rom','清代才子佳人小说。'),
 ('李娃傳','The Story of Li Wa','白行简',800,'HSK5','rom','唐传奇爱情名篇。'),
 ('虬髯客傳','The Curly-Bearded Hero','杜光庭',900,'HSK5','adv','唐传奇侠客名篇。'),
 ('文心雕龍','The Literary Mind and the Carving of Dragons','刘勰',502,'HSK6','poe','中国文学理论的开山之作。'),
 ('世說新語','A New Account of Tales of the World','刘义庆',430,'HSK5','lit','魏晋名士言行笔记。'),
 ('六祖壇經','Platform Sutra of the Sixth Patriarch','慧能',714,'HSK6','phl','中国佛教唯一的本土经典。'),
 ('夢溪筆談','Dream Pool Essays','沈括',1088,'HSK6','phl','宋代科学与人文笔记。'),
 ('顔氏家訓 — Volume 01 and 02','Family Instructions I','颜之推',590,'HSK6','phl','家训卷一至卷二。'),
]

def classify(r):
    sh=(r['Bookshelves'] or '').lower()+' '+(r['Subjects'] or '').lower()
    if any(k in sh for k in ['fiction','novel','短篇','stories']): return 'lit'
    if any(k in sh for k in ['poetry','poems','ci (']): return 'poe'
    if any(k in sh for k in ['drama','theater','plays']): return 'drama'
    if any(k in sh for k in ['history','biograph']): return 'his'
    if any(k in sh for k in ['philosophy','ethic','conduct','religion']): return 'phl'
    if any(k in sh for k in ['legend','folklore','myth']): return 'fab'
    return 'lit'

def clean_author(a):
    a=(a or '').split(';')[0]
    parts=[p.strip() for p in a.split(',')]
    parts=[p for p in parts if not re.match(r'^\d{3,4}([-?].*)?$', p)]
    return (parts[0] if parts else a)[:30]

out=[]; seen=set()
def add(gb, cn, en, author, year, lv, g, d, fs=0):
    if gb in seen or gb not in by_gb: return
    seen.add(gb)
    out.append(dict(gb=gb, t=cn, zh=cn, en=en, a=author, y=year, lv=lv, g=g, d=d, fs=fs, demo=[]))

for i,(title,en,author,year,lv,g,d) in enumerate(FLAGS):
    gb=by_title.get(title)
    if gb is None:
        print('missing',title); continue
    add(gb,title,en,author,year,lv,g,d, 1 if i<10 else 0)

# 其余全部中文书（补足规模）
for r in sorted(by_gb.values(), key=lambda r:int(r['Text#'])):
    gb=int(r['Text#'])
    if gb in seen: continue
    t=(r['Title'] or '').strip().replace(', Complete','').replace(' — Part 1','').replace(' — Part 2','')
    t=re.sub(r'\s*\((Bīng Fǎ|Selections[^)]*)\)', '', t)
    add(gb, t, '', clean_author(r['Authors']), 0, 'HSK6', classify(r), '', 0)

print('zh books', len(out))
js="window.LZ_LANG_ZH = "+json.dumps(out,ensure_ascii=False,separators=(',',':'))+";\n"
open('data/lang-zh.js','w',encoding='utf-8').write(js)
