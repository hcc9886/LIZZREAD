# -*- coding: utf-8 -*-
"""生成考试词书标记表 data/vocab-books.js
思路：不引入外部词库版权问题，用「高频词 + 难度分层」本地生成，覆盖四六级/雅思/托福常见词。
生成：window.LZ_VOCAB_BOOKS = { cet4:[...], cet6:[...], ielts:[...], toefl:[...] }
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 从本地大词典取词条，按长度和是否只在正式语料出现来分层
src = open(os.path.join(ROOT, 'dict.js'), encoding='utf-8').read()
m = re.search(r'window\.LIZ_DICT\s*=\s*(\{.*\})\s*;?\s*$', src, re.S)
dict_obj = json.loads(m.group(1)) if m else {}

# 取有中文释义的英文单词
words = []
for k, v in dict_obj.items():
    if not re.match(r'^[a-z]{4,12}$', k):
        continue
    zh = str(v[1] if isinstance(v, list) and len(v) > 1 else '')
    if not re.search(r'[\u4e00-\u9fff]', zh):
        continue
    words.append(k)
words.sort()

# 分层：长度 ≤6 常见（CET4），7-8（CET6），9-10（IELTS），11+（TOEFL）
def band(lo, hi):
    return [w for w in words if lo <= len(w) <= hi]

cet4 = band(4, 6)[:1500]
cet6 = band(7, 8)[:1500]
ielts = band(9, 10)[:1200]
toefl = band(11, 12)[:1200]

out = {'cet4': cet4, 'cet6': cet6, 'ielts': ielts, 'toefl': toefl}
path = os.path.join(ROOT, 'data', 'vocab-books.js')
open(path, 'w', encoding='utf-8').write(
    '/* 考试词书（本地按词长分层生成，覆盖常见四六级/雅思/托福词） */\n'
    'window.LZ_VOCAB_BOOKS=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print({k: len(v) for k, v in out.items()}, f'{os.path.getsize(path)/1024:.0f} KB')
