/* =====================================================================
   LIZZREAD —— 句子拼装核心（assembly-core.js）
   自包含模块，无外部依赖。检测到 window.SharedStore 则自动接入共享日志层。
   能力：归一化、Levenshtein、意群切分、角色标注、拼装判定、IndexedDB 日志、
        句子表懒加载（Cache API + 内存）、按 sentence_id 打开拼装。
   数据协议见 sentences/*.json 与 sentences/index.json。
   ===================================================================== */

(function(global){
  'use strict';

  const DATA_ROOT = './sentences/';
  const INDEX_URL = DATA_ROOT + 'index.json';

  /* ---------- 1. 归一化 ---------- */
  function normalize(s){
    return String(s == null ? '' : s).trim().toLowerCase()
      .replace(/[^\w\s']/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---------- 2. Levenshtein ---------- */
  function levenshtein(a, b){
    a = normalize(a); b = normalize(b);
    if(a === b) return 0;
    if(!a.length) return b.length;
    if(!b.length) return a.length;
    const m = a.length, n = b.length;
    /* 双行滚动，千句批量判定也不卡 */
    let prev = new Array(n + 1);
    let cur = new Array(n + 1);
    for(let j = 0; j <= n; j++) prev[j] = j;
    for(let i = 1; i <= m; i++){
      cur[0] = i;
      for(let j = 1; j <= n; j++){
        const cost = a[i-1] === b[j-1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + cost);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }

  /* ---------- 3. 意群切分（2-5 块） ---------- */
  const PREPOSITIONS = new Set([
    'in','on','at','to','for','with','by','of','about','from','into',
    'through','over','under','above','below','between','among','around',
    'behind','before','beyond','during','except','inside','near','off',
    'onto','out','outside','past','since','toward','towards','upon','via','within','without'
  ]);
  const CLAUSE_MARKERS = new Set([
    'that','which','who','whom','whose','when','where','why','how',
    'if','because','although','though','while','whereas','unless',
    'until','as','than'
  ]);
  const CONJUNCTIONS = new Set(['and','but','or','nor','yet','so']);
  const BE_VERBS = new Set(['is','are','was','were','be','been','being','am']);
  const AUX_VERBS = new Set(['have','has','had','do','does','did','will','would','shall','should','can','could','may','might','must']);

  function wordsOf(text){ return String(text || '').trim().split(/\s+/).filter(Boolean); }
  function bare(w){ return String(w || '').toLowerCase().replace(/[^\w']/g, ''); }
  function isVerbLike(w){
    const x = bare(w);
    if(!x) return false;
    if(BE_VERBS.has(x) || AUX_VERBS.has(x)) return true;
    if(/^(is|are|was|were|has|have|had|does|do|did)$/.test(x)) return true;
    /* 规则动词：-s / -ed / -ing；排除常见名词复数（粗略但够用） */
    if(/(ed|ing)$/.test(x) && x.length > 4) return true;
    if(/s$/.test(x) && !/(ss|us|is)$/.test(x) && x.length > 3) return true;
    return false;
  }
  function isContent(w){ return /[A-Za-z]/.test(w) && !PREPOSITIONS.has(bare(w)) && !CONJUNCTIONS.has(bare(w)); }

  /* 粗切：标点边界（逗号、分号、破折号、冒号） */
  function punctSplit(raw){
    const parts = [];
    let last = 0;
    const re = /([,;:—–]|\s-\s)/g;
    let m;
    while((m = re.exec(raw)) !== null){
      const cut = m.index + m[0].length;
      const piece = raw.slice(last, cut).trim();
      if(piece) parts.push(piece);
      last = cut;
    }
    if(last < raw.length){
      const tail = raw.slice(last).trim();
      if(tail) parts.push(tail);
    }
    return parts.length ? parts : [raw.trim()];
  }

  /* 按从句/介词/连词/不定式再切一刀 */
  function refine(piece){
    const words = wordsOf(piece);
    if(words.length <= 3) return [piece];
    const out = [];
    let cur = [];
    for(let i = 0; i < words.length; i++){
      const w = words[i];
      const low = bare(w);
      const prev = cur.length ? bare(cur[cur.length - 1]) : '';
      let splitBefore = false;
      if(cur.length >= 2){
        if(CLAUSE_MARKERS.has(low) && !(low === 'as' && prev === 'such')) splitBefore = true;
        else if(PREPOSITIONS.has(low)) splitBefore = true;
        else if(CONJUNCTIONS.has(low)) splitBefore = true;
        else if(low === 'to' && i + 1 < words.length && !PREPOSITIONS.has(bare(words[i+1])) && !/^[A-Z]/.test(words[i+1])) splitBefore = true;
      }
      if(splitBefore && cur.length >= 2){
        out.push(cur.join(' '));
        cur = [w];
      } else {
        cur.push(w);
      }
    }
    if(cur.length) out.push(cur.join(' '));
    return out;
  }

  function mergeShort(chunks, minWords){
    const out = [];
    for(const c of chunks){
      if(!out.length){ out.push(c); continue; }
      const prevWords = wordsOf(out[out.length - 1]).length;
      const curWords = wordsOf(c).length;
      if(curWords < minWords && prevWords + curWords <= 7){
        out[out.length - 1] = out[out.length - 1] + ' ' + c;
      } else {
        out.push(c);
      }
    }
    /* 合并后仍只剩 1 块的长句：按动词/介词位置再切 */
    if(out.length === 1){
      const words = wordsOf(out[0]);
      if(words.length >= 5){
        let at = -1;
        for(let i = 2; i < words.length - 1; i++){
          if(PREPOSITIONS.has(bare(words[i])) || CONJUNCTIONS.has(bare(words[i])) || CLAUSE_MARKERS.has(bare(words[i]))){ at = i; break; }
        }
        if(at < 0) at = Math.ceil(words.length / 2);
        out.length = 0;
        out.push(words.slice(0, at).join(' '), words.slice(at).join(' '));
      }
    }
    return out;
  }

  function splitIntoChunks(text){
    const raw = String(text || '').trim();
    if(!raw) return [];
    let parts = punctSplit(raw);
    if(parts.length === 1 && wordsOf(raw).length > 18){
      const refined = refine(raw);
      if(refined.length > 1) parts = refined;
    } else if(parts.length > 1){
      const refined = [];
      for(const p of parts) refined.push(...refine(p));
      if(refined.length >= 2) parts = refined;
    }
    parts = parts.map(p => p.trim()).filter(Boolean);
    parts = mergeShort(parts, 2);
    /* 超过 5 块：合并最短的相邻块 */
    while(parts.length > 5){
      let idx = 0, best = Infinity;
      for(let i = 0; i < parts.length - 1; i++){
        const len = wordsOf(parts[i]).length + wordsOf(parts[i+1]).length;
        if(len < best){ best = len; idx = i; }
      }
      parts.splice(idx, 2, parts[idx] + ' ' + parts[idx+1]);
    }
    /* 少于 2 块：长句强制二分 */
    if(parts.length === 1 && wordsOf(raw).length >= 5){
      const words = wordsOf(raw);
      const at = Math.ceil(words.length / 2);
      parts = [words.slice(0, at).join(' '), words.slice(at).join(' ')];
    }
    return parts;
  }

  /* ---------- 4. 意群角色 ---------- */
  function chunkRoles(chunks){
    return (chunks || []).map((c, idx) => {
      const words = wordsOf(c);
      if(!words.length) return 'content';
      const first = bare(words[0]);
      if(PREPOSITIONS.has(first)) return 'prep_phrase';
      if(CLAUSE_MARKERS.has(first)) return 'clause';
      if(CONJUNCTIONS.has(first)) return 'conjunction';
      if(first === 'to' && words.length > 1) return 'infinitive';
      if(/ing$/.test(first) && first.length > 4) return 'participle';
      if(BE_VERBS.has(first)) return 'copular';
      if(AUX_VERBS.has(first)) return 'auxiliary';
      /* 首块含动词 → predicate；只有主语 → subject */
      const hasVerb = words.some(isVerbLike);
      if(hasVerb && (idx === 0 || idx === 1)) return 'predicate';
      if(idx === 0) return 'subject';
      if(hasVerb) return 'predicate';
      return 'content';
    });
  }

  /* ---------- 5. 拼装判定 ---------- */
  function judgeAssembly(userChunks, targetChunks){
    const u = (userChunks || []).map(normalize);
    const t = (targetChunks || []).map(normalize);

    if(u.length === t.length && u.every((x, i) => x === t[i])){
      return { result:'EXACT', errorType:null, hint:'完全正确，语序与意群都对了。', details:[] };
    }
    if(u.length !== t.length){
      const diff = t.length - u.length;
      return {
        result: diff < 0 ? 'OTHER' : 'OTHER',
        errorType: diff < 0 ? 'extra' : 'missing',
        hint: diff > 0 ? `少了 ${diff} 个意群块：这句话一共 ${t.length} 块。` : `多了 ${-diff} 个意群块：这句话只需 ${t.length} 块。`,
        details: []
      };
    }

    const details = [];
    let spelling = 0, order = 0, other = 0;
    const matched = new Set();
    for(let i = 0; i < t.length; i++){
      const uc = u[i], tc = t[i];
      if(uc === tc){ matched.add(i); continue; }
      const uWords = wordsOf(uc), tWords = wordsOf(tc);
      /* 拼写近似（词数相同、编辑距离 ≤2、首字母相同） */
      if(uWords.length === tWords.length && levenshtein(uc, tc) <= 2 && uc[0] === tc[0]){
        spelling++;
        matched.add(i);
        details.push({ index:i, type:'spelling', hint:`第 ${i+1} 块有个小拼写问题，正确写法是「${targetChunks[i]}」。` });
        continue;
      }
      /* 顺序错：当前块属于其他位置 */
      const j = t.findIndex((tt, k) => k !== i && !matched.has(k) && tt === uc);
      if(j >= 0){
        order++;
        matched.add(j);
        details.push({ index:i, type:'order', hint:`「${targetChunks[i]}」应该放在第 ${i+1} 位；你把「${userChunks[i]}」放这里了，它属于第 ${j+1} 位。` });
        continue;
      }
      other++;
      details.push({ index:i, type:'other', hint:`第 ${i+1} 块应该是「${targetChunks[i]}」。` });
    }

    let result, errorType, hint;
    if(spelling === 0 && order === 0 && other === 0) result = 'EXACT';
    else if(spelling > 0 && order === 0 && other === 0){ result = 'SPELLING'; errorType = 'spelling'; }
    else if(order > 0 && spelling === 0 && other === 0){ result = 'ORDER_ERROR'; errorType = 'order'; }
    else { result = 'MIXED'; errorType = 'mixed'; }
    hint = details.length ? details[0].hint : '再试一次，注意意群边界与语序。';
    if(details.length > 1) hint += `（共 ${details.length} 处可改进）`;
    return { result, errorType, hint, details };
  }

  /* ---------- 6. 日志（IndexedDB + 可选 SharedStore） ---------- */
  let _dbPromise = null;
  function openDB(){
    if(_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('lizzread_local', 2);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if(!db.objectStoreNames.contains('assembly_log')){
          db.createObjectStore('assembly_log', {keyPath:'log_id'});
        }
        if(!db.objectStoreNames.contains('assembly_log_v2')){
          const st = db.createObjectStore('assembly_log_v2', {keyPath:'log_id'});
          st.createIndex('by_sentence', 'sentence_id', {unique:false});
          st.createIndex('by_time', 'timestamp', {unique:false});
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function recordAssembly(log){
    const full = Object.assign({
      log_id: 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8),
      timestamp: Date.now()
    }, log || {});
    if(full.duration_ms == null && full.durationMs != null) full.duration_ms = full.durationMs;
    openDB().then(db => {
      const tx = db.transaction('assembly_log_v2', 'readwrite');
      tx.objectStore('assembly_log_v2').put(full);
    }).catch(()=>{});
    if(global.SharedStore && typeof global.SharedStore.recordAssembly === 'function'){
      try{ global.SharedStore.recordAssembly(full); }catch(e){}
    }
    return full;
  }

  function recentLogs(limit){
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction('assembly_log_v2', 'readonly');
      const st = tx.objectStore('assembly_log_v2');
      const req = st.index('by_time').openCursor(null, 'prev');
      const out = [];
      req.onsuccess = e => {
        const cur = e.target.result;
        if(cur && out.length < (limit || 20)){ out.push(cur.value); cur.continue(); }
        else resolve(out);
      };
      req.onerror = () => reject(req.error);
    })).catch(() => []);
  }

  /* ---------- 7. 句子表懒加载 ---------- */
  const _packCache = Object.create(null);
  let _indexPromise = null;

  function loadIndex(){
    if(!_indexPromise){
      _indexPromise = fetch(INDEX_URL, {cache:'force-cache'})
        .then(r => r.ok ? r.json() : {})
        .catch(() => ({}));
    }
    return _indexPromise;
  }

  function loadBookSentences(bookId){
    if(!bookId) return Promise.resolve([]);
    if(!isWebScheme()) return Promise.resolve([]);
    if(_packCache[bookId]) return Promise.resolve(_packCache[bookId]);
    const url = DATA_ROOT + bookId + '.json';
    const read = () => fetch(url, {cache:'force-cache'})
      .then(r => r.ok ? r.json() : [])
      .catch(() => []);
    let p;
    if(global.caches && caches.open){
      p = caches.open('lizzread_sentences_v2')
        .then(cache => cache.match(url).then(res => {
          if(res) return res.json();
          return read().then(data => {
            if(data && data.length){
              cache.put(url, new Response(JSON.stringify(data), {headers:{'Content-Type':'application/json'}})).catch(()=>{});
            }
            return data;
          });
        }))
        .catch(read);
    } else p = read();
    return p.then(data => {
      _packCache[bookId] = Array.isArray(data) ? data : [];
      return _packCache[bookId];
    });
  }

  async function loadSentence(sentenceId){
    if(!sentenceId) return null;
    /* 快路径：sentence_id 前缀就是书 id，不必加载 4MB 的 index.json */
    const m = String(sentenceId).match(/^(book\d+)_s\d+/);
    if(m){
      const arr = await loadBookSentences(m[1]);
      const hit = arr.find(s => s && s.sentence_id === sentenceId);
      if(hit) return hit;
    }
    const index = await loadIndex();
    const file = index[sentenceId];
    if(file){
      const bookId = String(file).replace(/\.json$/i, '');
      const arr = await loadBookSentences(bookId);
      return arr.find(s => s && s.sentence_id === sentenceId) || null;
    }
    return null;
  }

  /* ---------- 8. 初始化 + 打开拼装 ---------- */
  function isWebScheme(){
    return typeof location !== 'undefined' && location.protocol && /^https?:$/.test(location.protocol);
  }
  function initReaderAssembly(){
    if(!isWebScheme()){
      global.LZAssembly = global.LZAssembly || {};
      global.LZAssembly.books = global.LZAssembly.books || [];
      return Promise.resolve(global.LZAssembly);
    }
    /* 首屏不加载 4MB index：只用 books.json 判断数据是否可用 */
    if(typeof location !== 'undefined' && location.protocol && !/^https?:$/.test(location.protocol)){
      global.LZAssembly = global.LZAssembly || {}; global.LZAssembly.books = [];
      return Promise.resolve([]);
    }
    return fetch(DATA_ROOT + 'books.json?v=2', {cache:'force-cache'})
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then(list => {
        global.LZAssembly = global.LZAssembly || {};
        global.LZAssembly.books = list;
        global.LZAssembly.indexLoaded = true;
        return list;
      });
  }

  async function openAssembly(sentenceId){
    const s = await loadSentence(sentenceId);
    if(!s){
      if(global.AssemblyPanel && global.AssemblyPanel.toast) global.AssemblyPanel.toast('这句还没有拼装数据，可在阅读器里点「🧩 拼一句」实时生成。');
      else console.warn('assembly: sentence not found', sentenceId);
      return;
    }
    /* 取同书相邻句，给面板「联系本文」用 */
    const m = String(sentenceId).match(/^(book\d+)_/);
    let ctx = null;
    if(m){
      const arr = await loadBookSentences(m[1]);
      const i = arr.findIndex(x => x && x.sentence_id === sentenceId);
      if(i >= 0){
        ctx = {
          prev: arr[i-1] ? arr[i-1].text : '',
          next: arr[i+1] ? arr[i+1].text : '',
          chapter: '',
          word: (s.target_words && s.target_words[0]) || ''
        };
      }
    }
    if(global.AssemblyPanel && global.AssemblyPanel.openAssembly){
      global.AssemblyPanel.openAssembly(s, (s.target_words && s.target_words[0]) || null, ctx);
    }
  }

  /* ---------- 9. 暴露接口 ---------- */
  const AssemblyCore = {
    version: '2.0.0',
    normalize, levenshtein, splitIntoChunks, chunkRoles,
    judgeAssembly, recordAssembly, recentLogs,
    loadBookSentences, loadSentence, loadIndex, initReaderAssembly, openAssembly,
    packCache: _packCache,
    DATA_ROOT
  };
  if(typeof module !== 'undefined' && module.exports) module.exports = AssemblyCore;
  global.AssemblyCore = AssemblyCore;

})(typeof window !== 'undefined' ? window : globalThis);
