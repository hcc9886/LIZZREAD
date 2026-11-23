# -*- coding: utf-8 -*-
"""为每门语言的 24 道词汇题补一份「英文选项」，支持答题语言切换（中文 / English）"""
import json, re

# 每门语言 24 个词的英文对应（与 data/i18n.js、data/lang-tests.js 的词序一致）
EN = {
 'en': ["apple","happy","water","book","journey","decide","weather","borrow","achieve","environment",
        "suggest","challenge","acknowledge","considerable","evaluate","circumstances","discrepancies",
        "legitimate","predominantly","unprecedented","surreptitious","esoteric","perfunctory","magnanimous"],
 'de': ["apple","happy","water","book","journey","decide","weather","borrow","reach","environment",
        "suggest","challenge","acknowledge","considerable","evaluate","circumstances","discrepancies",
        "legitimate","predominantly","unprecedented","secretly","esoteric","superficial","magnanimous"],
 'fr': ["apple","happy","water","book","voyage","decide","time","borrow","reach","environment",
        "suggest","challenge","recognize","considerable","evaluate","circumstances","discrepancies",
        "legitimate","predominantly","unprecedented","stealthy","esoteric","superficial","magnanimous"],
 'it': ["apple","happy","water","book","journey","decide","time/rhythm","borrow","reach","environment",
        "suggest","challenge","recognize","considerable","evaluate","circumstances","discrepancies",
        "legitimate","predominantly","unprecedented","stealthy","esoteric","superficial","magnanimous"],
 'es': ["apple","happy","water","book","journey","decide","time","borrow","achieve","environment",
        "suggest","challenge","recognize","considerable","evaluate","circumstances","discrepancies",
        "legitimate","predominantly","unprecedented","stealthy","esoteric","superficial","magnanimous"],
 'ja': ["apple","happy","water","book","travel","decide","weather","borrow","achieve","environment",
        "propose","challenge","acknowledge","considerable","evaluate","situation","inconsistency",
        "legitimate","mainly","unprecedented","secret","abstruse","superficial","magnanimous"],
 'ko': ["apple","happy","water","book","travel","decide","weather","borrow","achieve","environment",
        "suggest","challenge","approve","considerable","evaluate","situation","inconsistency",
        "legitimate","mainly","unprecedented","secretive","abstruse","superficial","generous"],
 'zh': ["hello","water","apple","school","travel","decide","weather","borrow","achieve","environment",
        "suggestion","challenge","acknowledgment","considerable","assessment","circumstances","difference",
        "legitimate","predominantly","unprecedented","secretive","profound","perfunctory","magnanimous"],
 'nl': ["house","water","book","bread","bicycle","school","city","friend",
        "big","small","beautiful","fast","warm","cold","new","old",
        "good","bad","read","write","walk","eat","sleep","forget"],
 'pt': ["house","water","book","bread","car","school","city","friend",
        "big","small","beautiful","fast","hot","cold","new","old",
        "good","bad","read","write","walk","eat","sleep","forget"],
 'la': ["water","book","house","bread","city","friend","sun","moon",
        "big","small","good","bad","new","old","read","write",
        "walk","eat","sleep","person","woman","boy","land","sky"],
 'el': ["water","bread","book","house","city","friend","sun","moon",
        "big","small","good","bad","new","old","read","write",
        "walk","eat","sleep","person","woman","child","land","sky"],
 'fi': ["water","bread","book","house","city","friend","sun","moon",
        "big","small","good","bad","new","old","read","write",
        "walk","eat","sleep","person","woman","child","land","sky"],
 'hu': ["water","bread","book","house","city","friend","sun","moon",
        "big","small","good","bad","new","old","read","write",
        "walk","eat","sleep","person","woman","child","land","sky"],
 'sv': ["water","bread","book","house","city","friend","sun","moon",
        "big","small","good","bad","new","old","read","write",
        "walk","eat","sleep","person","woman","child","land","sky"],
 'eo': ["water","bread","book","house","city","friend","sun","moon",
        "big","small","good","bad","new","old","read","write",
        "walk","eat","sleep","person","woman","child","land","sky"],
}

# 中文选项：老 8 门来自 i18n.js，新 8 门来自 lang-tests.js
import subprocess
zh = {}
js = """
global.window={};
const fs=require('fs');
eval(fs.readFileSync('data/i18n.js','utf8'));
eval(fs.readFileSync('data/lang-tests.js','utf8'));
const out={};
const L=window.LZ_L||{};
for(const c of Object.keys(L)){ if(L[c].test) out[c]=L[c].test.map(q=>({w:q.w,zh:q.o[0]})); }
const T=window.LZ_TEST||{};
for(const c of Object.keys(T)){ out[c]=T[c].map(q=>({w:q.w,zh:q.o[0]})); }
console.log(JSON.stringify(out));
"""
res = subprocess.run(['node','-e',js], capture_output=True, text=True, cwd='.')
zh = json.loads(res.stdout)

out = {}
for code, ens in EN.items():
    zs = zh.get(code) or []
    if len(zs) != len(ens):
        print('SKIP', code, len(zs), len(ens)); continue
    out[code] = [{"w": zs[i]["w"], "zh": zs[i]["zh"], "en": ens[i]} for i in range(len(ens))]

open('data/lang-test-options.js','w',encoding='utf-8').write(
  "/* 词汇测试的双语选项（中文 / English），由 scripts/build-test-options.py 生成 */\n"
  "window.LZ_TEST_OPT=" + json.dumps(out, ensure_ascii=False, separators=(',',':')) + ";\n")
print('生成:', {k: len(v) for k, v in out.items()})
