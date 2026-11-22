# -*- coding: utf-8 -*-
"""Build data/catalog.js — 3000+ Project Gutenberg English books for LIZZREAD.
Source: gutenberg.pglaf.org/cache/epub/feeds/pg_catalog.csv
Selection: curated famous authors/titles first, then genre quotas.
"""
import csv, re, json, sys, os, collections, unicodedata

CAT = '/tmp/pg_catalog.csv'
OUT = 'data/catalog.js'

rows = list(csv.DictReader(open(CAT, encoding='utf-8', errors='replace')))
en = [r for r in rows if r['Type'] == 'Text' and r['Language'] == 'en'
      and r['Text#'].strip().isdigit() and r['Title'].strip() and r['Authors'].strip()]

# ---------- existing books from index.html (keep their ids/metadata) ----------
html = open('index.html', encoding='utf-8').read()
existing = []
block = re.search(r'const BOOKS = \[(.*?)\n\];', html, re.S)
if block:
    for m in re.finditer(r'\{id:"([^"]+)",\s*t:"([^"]*)",\s*zh:"([^"]*)",\s*a:"([^"]*)",\s*y:([-\d]+),\s*lv:"([^"]+)",\s*g:"([^"]+)",\s*gb:(\d+)', block.group(1)):
        existing.append(dict(id=m.group(1), t=m.group(2), zh=m.group(3), a=m.group(4),
                             y=int(m.group(5)), lv=m.group(6), g=m.group(7), gb=int(m.group(8))))
EX_GB = {e['gb'] for e in existing}

# ---------- famous authors (surnames / full keys) ----------
FAMOUS = """
shakespeare austen dickens twain tolstoy dostoevsky dostoyevsky hugo dumas bronte hardy eliot wilde
goethe dante cervantes melville hawthorne poe conrad joyce woolf hemingway fitzgerald kafka proust
balzac stendhal flaubert zola chekhov gogol turgenev ibsen strindberg moliere racine voltaire rousseau
swift defoe fielding sterne burns blake wordsworth coleridge shelley keats byron tennyson browning milton
pope chaucer spenser bacon locke hume kant nietzsche schopenhauer hegel marx engels smith mill darwin
freud jung plato aristotle epictetus aurelius seneca plutarch herodotus thucydides xenophon caesar cicero
virgil homer ovid sappho sun tzu laozi confucius machiavelli more hobbes paine franklin douglass dubois
washington lincoln thoreau emerson whitman dickinson longfellow irving cooper prescott motley parkman
james wharton cather london sinclair dreiser doyle christie chesterton collins lefanu stoker wells verne
burroughs lovecraft hoffmann grimm andersen perrault aesop carroll baum grahame kipling potter barrie
burnett alcott montgomery spyri edgeworth nesbit lear gibbon macaulay carlyle tacitus josephus froissart
hakluyt huxley tyndall faraday maxwell helmholtz newton galileo kepler descartes pascal lavoisier lyell
wallace fabre marlowe jonson webster congreve sheridan goldsmith schiller lessing calderon vega donne
herbert marvell dryden gray blake wordsworth coleridge byron shelley keats tennyson browning roscommon
akhmatova pushkin lermontov zamyatin bulgakov babel isaac huston heine rousseau montaigne rabelais
casanova cellini vasari burckhardt gibbon paine weber veblen sumner ward addams jane adams
bronte brontë dostoievski tolstoi tchekhov turgenev gontcharov kuprin andreev artsybashev
saadi rumi hafiz omar khayyam fitzgerald arabian nights
walsh doyle chopin gilman perkins stetson
""".split()
# normalize and also include last names without accents
FAMOUS = set(x.lower().replace('ë','e').replace('é','e').replace('ï','i') for x in FAMOUS)

# ---------- famous titles subset ----------
FAMOUS_TITLES = """
pride and prejudice moby dick frankenstein alice's adventures in wonderland adventures of sherlock holmes
the picture of dorian gray dracula the great gatsby heart of darkness the yellow wallpaper
the tell-tale heart the raven the fall of the house of usher the cask of amontillado
the adventures of tom sawyer adventures of huckleberry finn the call of the wild white fang
treasure island the strange case of dr jekyll and mr hyde kidnapped robinson crusoe
a tale of two cities great expectations oliver twist david copperfield bleak house
jane eyre wuthering heights emma persuasion sense and sensibility mansfield park northanger abbey
little women anne of green gables the secret garden peter pan the wind in the willows
grimms' fairy tales hans christian andersen fairy tales aesop's fables the arabian nights
the time machine the war of the worlds the invisible man journey to the center of the earth
twenty thousand leagues under the sea the Count of Monte Cristo the three musketeers
war and peace crime and punishment the brothers karamazov anna karenina resurrection
les miserables the hunchback of notre-dame the divine comedy paradise lost the iliad the odyssey
the aeneid meditations the republic the prince utopia the wealth of nations on liberty
the descent of man the origin of species the interpretation of dreams thus spake zarathustra
the confessions the city of god the decline and fall of the roman empire
the history of the peloponnesian war the annals the gallic wars
hamlet macbeth king lear othello a midsummer night's dream romeo and juliet the tempest
the importance of being earnest a doll's house the cherry orchard
the prophet the story of my life the souls of black folk up from slavery
walden leaves of grass the awakening the age of innocence ethan frome
the red badge of courage the jungle the house of mirth
canterbury tales the faerie queene songs of innocence and of experience
the rime of the ancient mariner kubla khan odyssey
beowulf the song of roland the nibelungenlied
the book of the dead the egyptian book of the dead
""".replace('\n',' ').lower().split('  ')
FAMOUS_TITLES = [x.strip() for x in FAMOUS_TITLES if x.strip()]

# ---------- genre inference ----------
def classify(r):
    shelves = r['Bookshelves'].lower()
    subj = r['Subjects'].lower()
    def has(*keys): return any(k in shelves or k in subj for k in keys)
    # explicit genre signals first
    if has('science-fiction','science fiction','fantasy'):
        return 'sci'
    if has('crime','thriller','mystery','detective'):
        return 'mys'
    if has('fairy','fable','mythology','legend','folklore'):
        return 'fab'
    if has('adventure','sea tales','exploration','western','travel writing') and not has('fairy','fable'):
        return 'adv'
    if has('plays','drama','theatre','theater'):
        return 'drama'
    if has('poetry','poems','verse'):
        return 'poe'
    # fiction / literature dominates subject-only history or philosophy
    if has('novels','literature','short stories','classics of literature'):
        return 'lit'
    if has('romance','love story'):
        return 'rom'
    if has('humour','humor','comic','satire'):
        return 'hum'
    if has("children & young adult","children's book","juvenile"):
        return 'fab'
    if has('philosophy','ethics','religion','spirituality','psychology'):
        return 'phl'
    if has('history','biograph','autobiograph','memoir','warfare','politics','law','sociology'):
        return 'his'
    return 'lit'

LEVELS = {'lit':'B2','mys':'B2','sci':'B2','fab':'B1','adv':'B1','phl':'C1','drama':'C1',
          'poe':'C1','his':'C1','rom':'B1','hum':'B2'}
LEVEL_OVERRIDE = {'fab':'B1','adv':'B1','rom':'B1'}

def author_key(a):
    a = a.split(';')[0].strip()
    return a

def norm(s):
    s = s.lower()
    s = unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode('ascii')
    s = re.sub(r'[^a-z0-9 ]',' ', s)
    return re.sub(r'\s+',' ',s).strip()

def lastname(a):
    a = author_key(a)
    return norm(a.split(',')[0]) if ',' in a else norm(a.split()[-1] if a.split() else '')

def title_norm(t):
    t = norm(t)
    t = re.sub(r'\b(complete|vol|volume|part|book|series|illustrated|edition|translated|with|the|a|an)\b',' ',t)
    return re.sub(r'\s+',' ',t).strip()

TITLE_KEYS = [norm(x) for x in FAMOUS_TITLES]
def title_famous(t):
    nt = title_norm(t)
    for k in TITLE_KEYS:
        if nt == k or nt.startswith(k+' ') or k in nt and len(k.split()) >= 3:
            return True
    return False

# ---------- scoring ----------
def score(r):
    s = 0
    tnum = int(r['Text#'])
    if tnum in EX_GB: s += 5000
    ln = lastname(r['Authors'])
    if ln in FAMOUS: s += 900
    if title_famous(r['Title']): s += 1600
    sh = r['Bookshelves'].lower()
    if 'bestsellers' in sh: s += 500
    if 'harvard classics' in sh: s += 600
    if 'nobel' in sh: s += 700
    if 'classics of literature' in sh: s += 400
    if 'librivox' in sh: s += 150
    # penalize non-book / reference / periodicals
    bad = ['almanac','catalogue','catalog','annual report','directory','periodical','journal','magazine',
           'encyclopedia','dictionary','pamphlet','pamphlets','proceedings','transactions','bulletin',
           'constitution','statutes','law reports','debates','sessional','gazette','calendar','register',
           'yearbook','year book','handbook','manual','report of','reports of','minutes of']
    if any(b in (r['Title']+' '+sh).lower() for b in bad): s -= 900
    if len(r['Title']) < 6: s -= 300
    # category boosts
    cat = classify(r)
    boosts = {'lit':300,'mys':320,'sci':320,'fab':300,'adv':280,'phl':380,'drama':360,'poe':340,'his':420,'rom':260,'hum':300}
    s += boosts.get(cat, 200)
    return s

def clean_title(t):
    t = re.sub(r'\s+', ' ', t).strip()
    t = t.strip('"')
    return t

def issue_year(r):
    m = re.match(r'(\d{4})', r['Issued'] or '')
    return int(m.group(1)) if m else 0

# ---------- select ----------
rows2 = []
seen = set()
for r in en:
    gb = int(r['Text#'])
    t = clean_title(r['Title'])
    a = author_key(r['Authors'])
    if not a or a.lower() in ('various','unknown','anonymous'):
        pass
    # dedupe by title+author, but never drop an existing book
    key = (title_norm(t), lastname(a))
    if gb not in EX_GB and key in seen: continue
    seen.add(key)
    g = classify(r)
    rows2.append(dict(gb=gb, t=t, a=a, g=g, score=score(r), y=issue_year(r), shelves=r['Bookshelves']))

rows2.sort(key=lambda x: (-x['score'], x['gb']))

QUOTA = {'lit':1050,'mys':300,'sci':270,'fab':280,'adv':300,'phl':300,'drama':240,'poe':180,'his':320,'rom':120,'hum':100}
selected = []
count = collections.Counter()
# pass 1: quotas, prioritising score
for r in rows2:
    if r['gb'] in EX_GB: continue
    if count[r['g']] < QUOTA.get(r['g'], 200):
        selected.append(r); count[r['g']] += 1
# pass 2: fill to 3200 with highest remaining, keep variety
for r in rows2:
    if len(selected) >= 3600: break
    if r['gb'] in EX_GB: continue
    if r in selected: continue
    selected.append(r); count[r['g']] += 1

# ---------- build merged catalog ----------
# existing metadata wins (already translated)
out = []
for e in existing:
    out.append(dict(id=e['id'], t=e['t'], zh=e['zh'], a=e['a'], y=e['y'], lv=e['lv'], g=e['g'], gb=e['gb'],
                    d='', src='local'))
# new entries
for r in selected[:3600]:
    if r['gb'] in EX_GB: continue
    lv = LEVELS.get(r['g'], 'B2')
    t = r['t']
    # strip trailing author / brackets often present in titles
    t = re.sub(r'\s*[\[(]illustrated[\]).]*$','',t,flags=re.I)
    t = re.sub(r'\s*;.*$','',t)
    zh = ''
    d = 'Project Gutenberg 公版全文 · ' + {'lit':'文学经典','mys':'侦探推理','sci':'科幻幻想','fab':'童话寓言','adv':'冒险探索','phl':'哲学历史','drama':'戏剧诗歌','poe':'诗歌','his':'历史传记','rom':'爱情小说','hum':'幽默讽刺'}.get(r['g'],'文学经典')
    out.append(dict(id='pg'+str(r['gb']), t=t, zh=zh, a=r['a'], y=0, lv=lv, g=r['g'], gb=r['gb'], d=d, src='catalog'))

# sort: existing first (curated), then genre/score order
# keep a stable pleasant order: score desc already, but place existing at front
out.sort(key=lambda x: (0 if x['src']=='local' else 1,))
# dedupe gb final
final = []
seen_gb = set()
for x in out:
    if x['gb'] in seen_gb: continue
    seen_gb.add(x['gb']); final.append(x)
# cap
while len(final) > 3900:
    final.pop()

print('selected new', len(selected), 'final', len(final), 'genres', dict(collections.Counter(x['g'] for x in final)))
print('sample', final[0], final[-1])

js = '/* LIZZREAD 公版书库目录 — 自动生成，请勿手改 */\n'
js += 'window.PG_CATALOG = ' + json.dumps(final, ensure_ascii=False, separators=(',',':')) + ';\n'
open(OUT,'w',encoding='utf-8').write(js)
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
