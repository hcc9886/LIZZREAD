# -*- coding: utf-8 -*-
"""为新增的 8 门语言生成词汇测试题库（每门 24 题，6 个等级 × 4 题）"""
import json

# 每门语言：(词, 中文), 按难度从易到难排
DATA = {
 'nl': [("huis","房子"),("water","水"),("boek","书"),("brood","面包"),
        ("fiets","自行车"),("school","学校"),("stad","城市"),("vriend","朋友"),
        ("groot","大的"),("klein","小的"),("mooi","美丽的"),("snel","快的"),
        ("warm","温暖的"),("koud","冷的"),("nieuw","新的"),("oud","旧的"),
        ("goed","好的"),("slecht","坏的"),("lezen","阅读"),("schrijven","写"),
        ("wandelen","散步"),("eten","吃"),("slapen","睡觉"),("vergeten","忘记")],
 'pt': [("casa","房子"),("água","水"),("livro","书"),("pão","面包"),
        ("carro","汽车"),("escola","学校"),("cidade","城市"),("amigo","朋友"),
        ("grande","大的"),("pequeno","小的"),("bonito","美丽的"),("rápido","快的"),
        ("quente","热的"),("frio","冷的"),("novo","新的"),("velho","旧的"),
        ("bom","好的"),("mau","坏的"),("ler","阅读"),("escrever","写"),
        ("andar","走"),("comer","吃"),("dormir","睡觉"),("esquecer","忘记")],
 'la': [("aqua","水"),("liber","书"),("domus","房子"),("panis","面包"),
        ("urbs","城市"),("amicus","朋友"),("sol","太阳"),("luna","月亮"),
        ("magnus","大的"),("parvus","小的"),("bonus","好的"),("malus","坏的"),
        ("novus","新的"),("vetus","旧的"),("legere","阅读"),("scribere","写"),
        ("ambulare","走"),("edere","吃"),("dormire","睡觉"),("homo","人"),
        ("femina","女人"),("puer","男孩"),("terra","土地"),("caelum","天空")],
 'el': [("νερό","水"),("ψωμί","面包"),("βιβλίο","书"),("σπίτι","房子"),
        ("πόλη","城市"),("φίλος","朋友"),("ήλιος","太阳"),("φεγγάρι","月亮"),
        ("μεγάλος","大的"),("μικρός","小的"),("καλός","好的"),("κακός","坏的"),
        ("νέος","新的"),("παλιός","旧的"),("διαβάζω","阅读"),("γράφω","写"),
        ("περπατάω","走"),("τρώω","吃"),("κοιμάμαι","睡觉"),("άνθρωπος","人"),
        ("γυναίκα","女人"),("παιδί","孩子"),("γη","土地"),("ουρανός","天空")],
 'fi': [("vesi","水"),("leipä","面包"),("kirja","书"),("talo","房子"),
        ("kaupunki","城市"),("ystävä","朋友"),("aurinko","太阳"),("kuu","月亮"),
        ("suuri","大的"),("pieni","小的"),("hyvä","好的"),("huono","坏的"),
        ("uusi","新的"),("vanha","旧的"),("lukea","阅读"),("kirjoittaa","写"),
        ("kävellä","走"),("syödä","吃"),("nukkua","睡觉"),("ihminen","人"),
        ("nainen","女人"),("lapsi","孩子"),("maa","土地"),("taivas","天空")],
 'hu': [("víz","水"),("kenyér","面包"),("könyv","书"),("ház","房子"),
        ("város","城市"),("barát","朋友"),("nap","太阳"),("hold","月亮"),
        ("nagy","大的"),("kicsi","小的"),("jó","好的"),("rossz","坏的"),
        ("új","新的"),("régi","旧的"),("olvasni","阅读"),("írni","写"),
        ("sétálni","走"),("enni","吃"),("aludni","睡觉"),("ember","人"),
        ("nő","女人"),("gyerek","孩子"),("föld","土地"),("ég","天空")],
 'sv': [("vatten","水"),("bröd","面包"),("bok","书"),("hus","房子"),
        ("stad","城市"),("vän","朋友"),("sol","太阳"),("måne","月亮"),
        ("stor","大的"),("liten","小的"),("bra","好的"),("dålig","坏的"),
        ("ny","新的"),("gammal","旧的"),("läsa","阅读"),("skriva","写"),
        ("gå","走"),("äta","吃"),("sova","睡觉"),("människa","人"),
        ("kvinna","女人"),("barn","孩子"),("jord","土地"),("himmel","天空")],
 'eo': [("akvo","水"),("pano","面包"),("libro","书"),("domo","房子"),
        ("urbo","城市"),("amiko","朋友"),("suno","太阳"),("luno","月亮"),
        ("granda","大的"),("malgranda","小的"),("bona","好的"),("malbona","坏的"),
        ("nova","新的"),("malnova","旧的"),("legi","阅读"),("skribi","写"),
        ("promeni","走"),("manĝi","吃"),("dormi","睡觉"),("homo","人"),
        ("virino","女人"),("infano","孩子"),("tero","土地"),("ĉielo","天空")],
}
TIERS = ["A1","A2","B1","B2","C1","C2"]

out = {}
for code, words in DATA.items():
    assert len(words) == 24, (code, len(words))
    qs = []
    for i, (w, zh) in enumerate(words):
        tier = TIERS[i // 4]
        # 干扰项：同题组其它词的中文
        pool = [z for _, z in words if z != zh]
        import random
        random.seed(hash(code + w) & 0xffff)
        wrong = random.sample(pool, 3)
        qs.append({"t": tier, "w": w, "o": [zh] + wrong})
    out[code] = qs

js = "/* 新增语言的词汇测试题库（每门 24 题，由 scripts/build-tests.py 生成） */\nwindow.LZ_TEST=" + json.dumps(out, ensure_ascii=False, separators=(',',':')) + ";\n"
open('data/lang-tests.js','w',encoding='utf-8').write(js)
print("生成语言:", list(out.keys()), "| 每门题数:", len(out['nl']))
