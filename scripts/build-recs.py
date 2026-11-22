# -*- coding: utf-8 -*-
"""生成 data/lang-recs.js —— 每个学习语言的分级推荐书单（等级 → 书名列表）"""
import json, re, os

# 从各语言目录里按“经典程度”（fs 标志与前若干）+ 手动清单生成
def load(code):
    src=open(f'data/lang-{code}.js',encoding='utf-8').read()
    return json.loads(re.search(r'=\s*(\[.*\])\s*;?\s*$', src, re.S).group(1))

RECS={
 'en':{
   'A1':['Aesop\'s Fables',"Grimms' Fairy Tales",'Peter Pan'],
   'A2':["Alice's Adventures in Wonderland",'The Wonderful Wizard of Oz','The Secret Garden'],
   'B1':['The Adventures of Tom Sawyer','Treasure Island','The Time Machine'],
   'B2':['Pride and Prejudice','The Adventures of Sherlock Holmes','The Strange Case of Dr Jekyll and Mr Hyde'],
   'C1':['Wuthering Heights','Moby Dick','The Picture of Dorian Gray'],
   'C2':['Ulysses','Les Misérables','Thus Spoke Zarathustra']
 },
 'zh':{
   'HSK2':['三字經','弟子規'],
   'HSK3':['千字文','弟子規'],
   'HSK4':['論語','菜根譚','歐遊雜記'],
   'HSK5':['西遊記','老殘遊記','詩經','世說新語'],
   'HSK6':['紅樓夢','水滸傳','史記','儒林外史']
 },
 'ja':{
   'N4':['ごん狐','手袋を買いに','赤い蝋燭と人魚'],
   'N3':['走れメロス','銀河鉄道の夜','吾輩は猫である','檸檬','こころ'],
   'N2':['羅生門','坊っちゃん','草枕','人間失格','伊豆の踊子','高瀬舟'],
   'N1':['地獄変','河童','雪国','山月記','源氏物語','枕草子']
 },
 'ko':{
   '1':['콩쥐팥쥐전'],
   '2':['콩쥐팥쥐전','흥부전'],
   '3':['춘향전','심청전','홍길동전','토끼전','무정','흥부전'],
   '4':['구운몽','사씨남정기','운영전','배비장전'],
   '5':['한중록','양반전','허생전','예덕선생전'],
   '6':['한중록','허생전']
 },
 'de':{
   'A1':['Das Märchen von dem Myrtenfräulein','Reineke Fuchs'],
   'A2':['Faust: Der Tragödie erster Teil','Novelle','Hermann und Dorothea'],
   'B1':['Die Leiden des jungen Werther — Band 1','Egmont','Die Geschwister: Ein Schauspiel in einem Akt'],
   'B2':['Iphigenie auf Tauris','Die Wahlverwandtschaften','Der Sandmann'],
   'C1':['Siddhartha: eine indische Dichtung','West-östlicher Divan','Wilhelm Meisters Lehrjahre — Band 1'],
   'C2':['Faust: Der Tragödie zweiter Teil','Die Aufzeichnungen des Malte Laurids Brigge','Also sprach Zarathustra: Ein Buch für Alle und Keinen']
 },
 'fr':{
   'A1':["Candide, ou l'optimisme",'Jeannot et Colin','Memnon ou la sagesse humaine'],
   'A2':['Zadig, ou la Destinée, histoire orientale',"L'Ingénu",'Micromégas'],
   'B1':['Le tour du monde en quatre-vingts jours','La Tulipe Noire','Poil de Carotte'],
   'B2':['Cinq Semaines En Ballon','Autour de la Lune','La dame aux camélias'],
   'C1':['Les misérables Tome I: Fantine','Le comte de Monte-Cristo, Tome I','Notre-Dame de Paris'],
   'C2':['Du côté de chez Swann','La Chartreuse De Parme','Cyrano de Bergerac']
 },
 'it':{
   'A1':['Lezioni e Racconti per i bambini','Vecchie Storie'],
   'A2':['Tre racconti sentimentali','Il Benefattore'],
   'B1':['Cardello','Poesie scelte','Roberta'],
   'B2':['La Divina Commedia di Dante: Inferno','Orlando Furioso'],
   'C1':['Il Principe','La Divina Commedia di Dante: Complete'],
   'C2':['La Divina Commedia di Dante: Paradiso','Orlando Furioso']
 },
 'es':{
   'A1':['Platero y yo','La Navidad en las Montañas'],
   'A2':['El Gaucho Martín Fierro','Cuentos de Amor de Locura y de Muerte'],
   'B1':['Don Quijote','La Niña de Luzmela','El paraiso de las mujeres\\\\nNovela'],
   'B2':['La Celestina','La Fontana de Oro','Bailén'],
   'C1':['Belarmino y Apolonio','El Diablo Cojuelo'],
   'C2':['Naufragios de Alvar Núñez Cabeza de Vaca','Las inquietudes de Shanti Andia']
 }
}
out={}
for code,levels in RECS.items():
    books=load(code) if code!='en' else None
    titles=None
    if books is not None:
        titles={b['t'] for b in books}
    resolved={}
    for lv,names in levels.items():
        keep=[n for n in names if (titles is None or n in titles)]
        if keep: resolved[lv]=keep
    out[code]=resolved
print({k:{lv:len(v) for lv,v in r.items()} for k,r in out.items()})
open('data/lang-recs.js','w',encoding='utf-8').write('window.LZ_RECS='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';')
