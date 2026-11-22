# -*- coding: utf-8 -*-
"""由 dict.js（英汉词典）反向生成中→英分包索引（dicts/zh/*.js），供汉语学习模式点词使用"""
import json, re, os
src=open('dict.js',encoding='utf-8').read()
m=re.match(r'^window\.LIZ_DICT\s*=\s*(\{.*\})\s*;?\s*$', src.strip(), re.S)
D=json.loads(m.group(1))
CJK=re.compile(r'[\u4e00-\u9fff]+')
index={}
for w,v in D.items():
    if not isinstance(v,list) or len(v)<2: continue
    pos=str(v[0] or '').strip(); zh=str(v[1] or '')
    for run in CJK.findall(zh):
        if not run or len(run) > 4: continue
        if run not in index: index[run]=[w, pos, zh]
print('index', len(index))
os.makedirs('dicts/zh', exist_ok=True)
parts={}
for ch,wv in index.items():
    key='x%d' % (ord(ch[0]) % 16)
    parts.setdefault(key,{})[ch]=wv
for k,obj in parts.items():
    with open(f'dicts/zh/{k}.js','w',encoding='utf-8') as f:
        f.write('window.LZ_ZHD=window.LZ_ZHD||{};window.LZ_ZHD.'+k+'='+json.dumps(obj,ensure_ascii=False,separators=(',',':'))+';')
print('parts', {k:len(v) for k,v in parts.items()}, 'total bytes', sum(os.path.getsize(f'dicts/zh/{k}.js') for k in parts))
