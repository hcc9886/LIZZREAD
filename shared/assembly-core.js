/* =====================================================================
   LIZZREAD —— 句子拼装核心（assembly-core.js）
   自包含模块，无外部依赖。检测到 window.SharedStore 则自动接入。
   功能：归一化、Levenshtein 距离、意群切分、拼装判定、IndexedDB 日志
   ===================================================================== */

(function(global){
  'use strict';

  /* ---------- 1. 归一化 ---------- */
  function normalize(s){
    return String(s||"").trim().toLowerCase()
      .replace(/[^\w\s']/g,'')   // 去标点，保留字母数字下划线和撇号
      .replace(/\s+/g,' ')        // 合并空白
      .trim();
  }

  /* ---------- 2. Levenshtein 距离 ---------- */
  function levenshtein(a, b){
    a = normalize(a); b = normalize(b);
    if(a === b) return 0;
    if(!a.length) return b.length;
    if(!b.length) return a.length;
    const m = a.length, n = b.length;
    const dp = Array.from({length: m+1}, () => new Array(n+1).fill(0));
    for(let i=0;i<=m;i++) dp[i][0] = i;
    for(let j=0;j<=n;j++) dp[0][j] = j;
    for(let i=1;i<=m;i++){
      for(let j=1;j<=n;j++){
        const cost = a[i-1] === b[j-1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i-1][j]+1,      // 删除
          dp[i][j-1]+1,      // 插入
          dp[i-1][j-1]+cost  // 替换
        );
      }
    }
    return dp[m][n];
  }

  /* ---------- 3. 意群切分规则（第一版：表层线索） ---------- */
  const PREPOSITIONS = new Set([
    "in","on","at","to","for","with","by","of","about","from","into",
    "through","over","under","above","below","between","among","around",
    "behind","before","beyond","during","except","inside","near","off",
    "onto","out","outside","past","since","toward","towards","upon","via","within","without"
  ]);
  const CLAUSE_MARKERS = new Set([
    "that","which","who","whom","whose","when","where","why","how",
    "if","because","although","though","while","whereas","unless",
    "until","since","so","as","than"
  ]);
  const CONJUNCTIONS = new Set([
    "and","but","or","nor","yet","so"
  ]);

  function splitIntoChunks(text){
    const raw = String(text||"").trim();
    if(!raw) return [];

    // 步骤 1：按标点粗切
    let parts = [raw];

    // 按逗号、分号、破折号切分（保留标点在块尾）
    const punctRe = /([,;—–]|\s+-\s+)/g;
    const punctSplit = [];
    parts.forEach(p => {
      let last = 0;
      let m;
      while((m = punctRe.exec(p)) !== null){
        punctSplit.push(p.slice(last, m.index + m[0].length).trim());
        last = m.index + m[0].length;
      }
      if(last < p.length) punctSplit.push(p.slice(last).trim());
    });
    parts = punctSplit.filter(Boolean);

    // 步骤 2：按从句引导词、介词边界进一步切分
    const refined = [];
    parts.forEach(p => {
      const words = p.split(/\s+/).filter(Boolean);
      if(words.length <= 4){ refined.push(p); return; }

      let current = [];
      words.forEach((w, i) => {
        const lower = w.toLowerCase().replace(/[^\w']/g,'');
        // 检测切分点
        const shouldSplitBefore = (() => {
          // 句首跳过
          if(current.length === 0) return false;
          // 从句引导词前切分（that/which/who/when/where/because/although/while）
          if(CLAUSE_MARKERS.has(lower)) return true;
          // 介词短语边界切分（但不是句首）
          if(PREPOSITIONS.has(lower) && current.length >= 2) return true;
          // 并列连词（and/but/or）前切分
          if(CONJUNCTIONS.has(lower) && current.length >= 2) return true;
          // 不定式 to + 动词
          if(lower === "to" && i+1 < words.length && /^[a-z]+$/.test(words[i+1].toLowerCase().replace(/[^\w']/g,''))){
            return true;
          }
          return false;
        })();

        if(shouldSplitBefore && current.length > 0){
          refined.push(current.join(" ").trim());
          current = [w];
        } else {
          current.push(w);
        }
      });
      if(current.length > 0) refined.push(current.join(" ").trim());
    });
    parts = refined.filter(Boolean);

    // 步骤 3：合并相邻过短的块（保证每块至少 2 词，总共 2-5 块）
    parts = mergeShortChunks(parts, 2);

    // 步骤 4：如果总块数 > 5，合并最短的相邻对
    while(parts.length > 5){
      let minIdx = 0, minLen = Infinity;
      for(let i=0;i<parts.length-1;i++){
        const l = parts[i].split(/\s+/).length + parts[i+1].split(/\s+/).length;
        if(l < minLen){ minLen = l; minIdx = i; }
      }
      parts = parts.slice(0,minIdx)
        .concat([parts[minIdx]+" "+parts[minIdx+1]])
        .concat(parts.slice(minIdx+2));
    }

    // 步骤 5：如果总块数 < 2，强制再切一次
    if(parts.length <= 1){
      const words = raw.split(/\s+/);
      const mid = Math.ceil(words.length/2);
      parts = [words.slice(0,mid).join(" "), words.slice(mid).join(" ")];
    }

    return parts;
  }

  function mergeShortChunks(chunks, minWords){
    const result = [];
    let buffer = null;
    chunks.forEach(c => {
      const n = c.split(/\s+/).length;
      if(buffer){
        const bn = buffer.split(/\s+/).length;
        if(bn < minWords || n < minWords){
          buffer = buffer + " " + c;
        } else {
          result.push(buffer);
          buffer = c;
        }
      } else {
        buffer = n < minWords ? c : c;
      }
    });
    if(buffer) result.push(buffer);
    return result;
  }

  /* ---------- 4. 块角色标注（简化版） ---------- */
  function chunkRoles(chunks){
    return chunks.map(c => {
      const lower = c.toLowerCase();
      const firstWord = lower.split(/\s+/)[0] || "";
      if(PREPOSITIONS.has(firstWord)) return "prep_phrase";
      if(CLAUSE_MARKERS.has(firstWord)) return "clause";
      if(CONJUNCTIONS.has(firstWord)) return "conjunction";
      if(/^(is|are|was|were|be|been|being|am)$/.test(firstWord)) return "copular";
      if(/^(have|has|had|do|does|did|will|would|shall|should|can|could|may|might|must)$/.test(firstWord)) return "auxiliary";
      return "content";
    });
  }

  /* ---------- 5. 拼装判定 ---------- */
  function judgeAssembly(userChunks, targetChunks){
    const u = (userChunks||[]).map(normalize).filter(Boolean);
    const t = (targetChunks||[]).map(normalize).filter(Boolean);

    // 全对
    if(u.length === t.length && u.every((x,i) => x === t[i])){
      return { result: "EXACT", errorType: null, hint: "完全正确！" };
    }

    // 逐位检查
    let spellingErrors = 0, orderErrors = 0, otherErrors = 0;
    const hints = [];
    const matchedTargetIdx = new Set();

    for(let i=0;i<Math.max(u.length, t.length);i++){
      const uc = u[i] || "";
      const tc = t[i] || "";

      if(uc === tc){ matchedTargetIdx.add(i); continue; }

      // 拼写错误检查（Levenshtein ≤ 2 且单词数相同）
      const uWords = uc.split(/\s+/).filter(Boolean);
      const tWords = tc.split(/\s+/).filter(Boolean);
      if(uWords.length === tWords.length && uWords.length > 0){
        const dist = levenshtein(uc, tc);
        if(dist <= 2){
          spellingErrors++;
          hints.push(`第 ${i+1} 块拼写接近，应为：「${tc}」`);
          matchedTargetIdx.add(i);
          continue;
        }
      }

      // 顺序错误检查：在 target 中找到当前 user 块
      const foundIdx = t.findIndex((tt, j) => !matchedTargetIdx.has(j) && tt === uc);
      if(foundIdx >= 0){
        orderErrors++;
        hints.push(`「${uc}」应在第 ${foundIdx+1} 位`);
        matchedTargetIdx.add(foundIdx);
        continue;
      }

      // 也检查拼写接近的 target 块
      const fuzzyIdx = t.findIndex((tt, j) => !matchedTargetIdx.has(j) && levenshtein(uc, tt) <= 2);
      if(fuzzyIdx >= 0){
        spellingErrors++;
        hints.push(`「${uc}」拼写接近，应为：「${t[fuzzyIdx]}」`);
        matchedTargetIdx.add(fuzzyIdx);
        continue;
      }

      otherErrors++;
    }

    // 单词数不一致 = 漏/多块
    if(u.length !== t.length){
      if(u.length < t.length){
        hints.unshift(`少了 ${t.length - u.length} 个意群块`);
      } else {
        hints.unshift(`多了 ${u.length - t.length} 个意群块`);
      }
    }

    // 错误分类优先级：拼写 → 顺序 → 其他
    if(spellingErrors > 0 && orderErrors === 0 && otherErrors === 0){
      return { result: "SPELLING", errorType: "spelling", hint: hints.join("；") || "有拼写小错误" };
    }
    if(orderErrors > 0 && spellingErrors === 0 && otherErrors === 0){
      return { result: "ORDER_ERROR", errorType: "order", hint: hints.join("；") || "顺序不对" };
    }
    if(spellingErrors > 0 || orderErrors > 0){
      return { result: "MIXED", errorType: "mixed", hint: hints.join("；") || "有拼写和顺序错误" };
    }
    return { result: "OTHER", errorType: "other", hint: hints.join("；") || "不完全对，再试试" };
  }

  /* ---------- 6. IndexedDB 日志 ---------- */
  let _dbPromise = null;
  function openDB(){
    if(_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("lizzread_local", 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if(!db.objectStoreNames.contains("assembly_log")){
          db.createObjectStore("assembly_log", {keyPath:"log_id"});
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function recordAssembly(log){
    const full = Object.assign({
      log_id: "a_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,8),
      timestamp: Date.now()
    }, log);

    // 写本地 IndexedDB
    openDB().then(db => {
      const tx = db.transaction("assembly_log", "readwrite");
      tx.objectStore("assembly_log").put(full);
    }).catch(()=>{});

    // 若存在 SharedStore 则同时写共享表
    if(global.SharedStore && typeof global.SharedStore.recordAssembly === "function"){
      try{ global.SharedStore.recordAssembly(full); }catch(e){}
    }
    return full;
  }

  /* ---------- 7. 句子加载（懒加载 + 缓存） ---------- */
  const _sentenceCache = {};
  function loadBookSentences(bookId){
    if(_sentenceCache[bookId]) return Promise.resolve(_sentenceCache[bookId]);
    // 先查 Cache API
    if("caches" in window){
      return caches.match("./sentences/" + bookId + ".json").then(resp => {
        if(resp) return resp.json();
        return fetch("./sentences/" + bookId + ".json")
          .then(r => r.ok ? r.json() : [])
          .catch(() => []);
      }).then(data => {
        _sentenceCache[bookId] = data;
        return data;
      });
    }
    return fetch("./sentences/" + bookId + ".json")
      .then(r => r.ok ? r.json() : [])
      .catch(() => []);
  }

  /* ---------- 8. 暴露接口 ---------- */
  const AssemblyCore = {
    normalize,
    levenshtein,
    splitIntoChunks,
    chunkRoles,
    judgeAssembly,
    recordAssembly,
    loadBookSentences
  };

  if(typeof module !== "undefined" && module.exports){
    module.exports = AssemblyCore;
  }
  global.AssemblyCore = AssemblyCore;

})(typeof window !== "undefined" ? window : globalThis);
