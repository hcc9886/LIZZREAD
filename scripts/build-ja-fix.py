import json, re, urllib.request, threading, queue
UA={'User-Agent':'Mozilla/5.0'}
def get(u, timeout=30):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=timeout).read().decode('utf-8','replace')
def cards_of(pid):
    try: h=get(f'https://www.aozora.gr.jp/index_pages/person{pid}.html')
    except Exception: return {}
    return {re.sub('<[^>]+>','',t).strip(): c for c,t in re.findall(r'href="\.\./cards/([0-9]+/card[0-9]+)\.html"[^>]*>(.*?)</a>', h)}
pids={'148':'夏目漱石','879':'芥川龍之介','35':'太宰治','81':'宮沢賢治','28':'川端康成','12':'森鴎外',
      '1079':'樋口一葉','99':'国木田独歩','40':'梶井基次郎','296':'中島敦','276':'島崎藤村','129':'石川啄木',
      '931':'新美南吉','425':'小泉八雲','498':'坂口安吾','46':'永井荷風','123':'与謝野晶子','552':'岡本かの子',
      '234':'佚名','265':'清少納言','223':'太安万侶','257':'紫式部'}
targets={
 '森鴎外':['舞姫','高瀬舟','雁','山椒大夫','阿部一族','最後の一句','ヰタ・セクスアリス','青年','うたかたの記','文づかひ'],
 '樋口一葉':['たけくらべ','にごりえ','十三夜','大つごもり','われから'],
 '国木田独歩':['武蔵野','忘れえぬ人々','牛肉と馬鈴薯','空知川の岸辺','源叔父','運命論者','春の鳥'],
 '梶井基次郎':['檸檬','城のある町にて','桜の樹の下には','愛撫','泥濘','冬の蝇'],
 '中島敦':['山月記','李陵','弟子','名人伝','牛人','悟浄出世'],
 '島崎藤村':['破戒','春','家','千曲川のスケッチ'],
 '石川啄木':['一握の砂','悲しき玩具'],
 '新美南吉':['ごん狐','手袋を買いに','でんでんむしのかなしみ'],
 '小泉八雲':['耳なし芳一','雪女','菊の契り','怪談','むじな'],
 '坂口安吾':['堕落論','白痴','桜の森の満開の下'],
 '永井荷風':['腕くらべ','あめりか物語','すみだ川'],
 '川端康成':['雪国','伊豆の踊子','千羽鶴','掌の小説'],
 '与謝野晶子':['みだれ髪'],
 '岡本かの子':['鶴は病みき'],
 '佚名':['竹取物語','伊勢物語'],
 '清少納言':['枕草子'],
 '太安万侶':['古事記'],
 '紫式部':['源氏物語'],
}
card_map={}
lock=threading.Lock()
def work(item):
    pid,name=item
    cs=cards_of(pid)
    with lock:
        for t in targets.get(name,[]):
            if t in cs: card_map[t]={'card':cs[t],'author':name}
ths=[threading.Thread(target=work,args=it) for it in pids.items()]
[t.start() for t in ths]; [t.join() for t in ths]
print('cards', len(card_map))
# 旧译名修正：槇(槙) 等
json.dump(card_map, open('/tmp/ja_cards2.json','w'), ensure_ascii=False)
