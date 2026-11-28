/* LIZZREAD · AI 能力层（智谱 GLM-4-Flash）
   部署版走服务端 /api/ai/chat 代理（Key 只在服务端环境变量）；
   没有后端时自动退回本地生成，静态站也不会报错。 */
(function(){
  /* 三条路，按优先级：
     ① 同源后端代理（Cloudflare Worker / Vercel / 本地 server.js）—— Key 在服务端
     ② 用户自己填的 Key（存 localStorage，只在本机）—— 纯静态站也能用 AI
     ③ 都没有 → 各功能退回本地生成，不报错 */
  /* 同源后端优先；同源没有时（如 GitHub Pages 静态站）兜底用已部署的 Worker。
     这个 Worker 地址可以在「设置 → AI 能力」里被用户自己的地址覆盖。 */
  const FALLBACK_BACKEND = "https://lizzread.13585658272.workers.dev";
  const ENDPOINTS = [
    "api/ai/chat",
    "public/api/ai/chat",
    FALLBACK_BACKEND + "/api/ai/chat"
  ];
  const ZHIPU_DIRECT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
  const KEY_STORE = "lz_ai_user_key";
  const BASE_STORE = "lz_ai_base";   /* 用户自填后端地址，如 https://lizzread.xxx.workers.dev */
  let _probe = null;
  const _cache = new Map();
  function keyOf(msgs){ return JSON.stringify(msgs).slice(0, 4000); }

  /* ---- 用户自填 Key ---- */
  function userKey(){
    try{ return (localStorage.getItem(KEY_STORE) || "").trim(); }catch(e){ return ""; }
  }
  function setUserKey(k){
    try{
      const v = String(k || "").trim();
      if(v) localStorage.setItem(KEY_STORE, v);
      else localStorage.removeItem(KEY_STORE);
      _probe = null;                     /* 让下次探测重新判断 */
      _cache.clear();
      return true;
    }catch(e){ return false; }
  }
  function hasUserKey(){ return !!userKey(); }
  /* ---- 用户自填后端地址（部署在 Cloudflare / Vercel 的自己的后端） ---- */
  function userBase(){
    try{ return (localStorage.getItem(BASE_STORE) || "").trim().replace(/\/+$/, ""); }catch(e){ return ""; }
  }
  function setUserBase(u){
    try{
      const v = String(u || "").trim().replace(/\/+$/, "");
      if(v) localStorage.setItem(BASE_STORE, v);
      else localStorage.removeItem(BASE_STORE);
      _probe = null; _cache.clear();
      return true;
    }catch(e){ return false; }
  }
  function endpoints(){
    const b = userBase();
    /* 用户填了自己的后端 → 只走他的；否则 同源 → 已部署 Worker 兜底 */
    return b ? [b + "/api/ai/chat", FALLBACK_BACKEND + "/api/ai/chat"] : ENDPOINTS;
  }
  /* 直接打智谱（浏览器端，Key 只在用户自己的机器上） */
  async function askDirect(messages, opt){
    const key = userKey();
    if(!key) return null;
    try{
      const r = await fetch(ZHIPU_DIRECT, {
        method: "POST",
        headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "glm-4-flash",
          messages,
          temperature: opt.temperature ?? 0.7,
          max_tokens: opt.maxTokens || 800
        }),
        signal: AbortSignal.timeout(opt.timeout || 45000)
      });
      const t = await r.text();
      let j = null; try{ j = JSON.parse(t); }catch(e){}
      if(!r.ok){
        const msg = (j && j.error && j.error.message) || ("HTTP " + r.status);
        if(/401|invalid|token|key/i.test(msg)) return { error: "Key 无效或已过期" };
        return { error: msg };
      }
      const text = j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : "";
      return text ? { text } : { error: "没有返回内容" };
    }catch(e){
      return { error: e.message || "网络错误" };
    }
  }

  let _probeAt = 0;
  async function probe(force){
    if(_probe !== null && !force){
      /* 负结果不永久缓存：30 秒后允许重试，避免一次网络抖动导致 AI 永久不可用 */
      if(_probe !== false) return _probe;
      if(Date.now() - _probeAt < 30000) return _probe;
      _probe = null;
    }
    _probe = false;
    _probeAt = Date.now();
    for(const ep of endpoints()){
      try{
        const hdrs = { "Content-Type": "application/json" };
        const uk0 = userKey();
        if(uk0) hdrs["x-user-key"] = uk0;
        const r = await fetch(ep, { method:"POST", headers: hdrs,
          body: JSON.stringify({ messages:[{ role:"user", content:"ping" }], max_tokens: 4 }),
          signal: AbortSignal.timeout(10000) });
        if(!r.ok) continue;
        const j = await r.json();
        if(j && j.configured){ _probe = "server"; _probeAt = Date.now(); return _probe; }
      }catch(e){}
    }
    if(userKey()){ _probe = "user"; _probeAt = Date.now(); return _probe; }
    return _probe;
  }
  /* 当前 AI 通道：server / user / false */
  async function mode(force){ return await probe(force); }

  async function ask(messages, opt){
    opt = opt || {};
    const m = await probe();
    if(!m){ _probe = null; return null; }   /* 别把失败缓存成永久结果 */
    const ck = keyOf(messages);
    if(!opt.noCache && _cache.has(ck)) return _cache.get(ck);

    /* ① 后端 */
    if(m === "server"){
      for(const ep of endpoints()){
        try{
          const hdrs = { "Content-Type": "application/json" };
          /* 用户填了自己的 Key 就带上，后端没有环境变量时会用它 */
          const uk = userKey();
          if(uk) hdrs["x-user-key"] = uk;
          const r = await fetch(ep, { method:"POST", headers: hdrs,
            body: JSON.stringify({ messages, temperature: opt.temperature ?? 0.7, max_tokens: opt.maxTokens || 800 }),
            signal: AbortSignal.timeout(opt.timeout || 45000) });
          if(!r.ok) continue;
          const j = await r.json();
          if(j && j.ok && j.text){ if(!opt.noCache) _cache.set(ck, j.text); return j.text; }
        }catch(e){}
      }
    }
    /* ② 用户自填 Key */
    const d = await askDirect(messages, opt);
    if(d && d.text){ if(!opt.noCache) _cache.set(ck, d.text); return d.text; }
    if(d && d.error){
      console.warn("[LZ_AI] 用户 Key 直连失败（多数服务商不允许浏览器直连，需填后端地址）：", d.error);
      try{ window.__LZ_AI_DIRECT_ERR = d.error; }catch(e){}
    }
    _probe = null;
    return null;
  }
  async function explainWord(word, sentence, zhSentence){
    const sys = "你是英语精读老师，回答必须简洁、具体、中文，不超过 160 字。";
    const user = `单词：${word}\n所在句子：${sentence}\n句子译文：${zhSentence || "（暂无）"}\n\n请按三行输出：\n1. 本句语境义：\n2. 用法：词性 + 句法作用，一句话\n3. 记忆点：词根词缀或联想，一句话`;
    return await ask([{ role:"system", content: sys }, { role:"user", content: user }], { maxTokens: 320 });
  }
  async function chatAboutBook(question, contextText, history){
    const sys = "你是这本书的领读老师。只根据用户提供的原文片段回答，不确定就直说。中文回答，条理清晰。";
    const msgs = [{ role:"system", content: sys }];
    if(contextText) msgs.push({ role:"user", content: "以下是这本书的片段：\n" + String(contextText).slice(0, 6000) });
    for(const h of (history || []).slice(-6)) msgs.push(h);
    msgs.push({ role:"user", content: question });
    return await ask(msgs, { maxTokens: 1200, temperature: 0.5 });
  }
  async function chatTutor(scene, history, lang){
    const langName = (window.LANG_INFO && window.LANG_INFO[lang] && window.LANG_INFO[lang].native) || "English";
    let persona = "";
    try{ persona = localStorage.getItem("lz_ai_persona") || ""; }catch(e){}
    if(persona) persona = "人设要求（优先遵守）：" + persona + "\n";
    const sys = persona + `你是耐心的${langName}陪练。规则：\n1) 用${langName}回应用户，句子简单、贴近${scene || "日常"}场景；\n2) 每句${langName}后面用括号给出中文翻译；\n3) 用户打错时先自然回应，再用一行「小提示：」指出语法或用词问题；\n4) 每次回复不超过 3 句。`;
    const msgs = [{ role:"system", content: sys }];
    for(const h of (history || []).slice(-10)) msgs.push(h);
    return await ask(msgs, { maxTokens: 400, temperature: 0.8 });
  }
  async function writeChapter(genre, level, prevSummary, chapterNo){
    const sys = `你是原创英文小说作者。写作要求：\n1) 原创，不提及任何已有作品、人物或情节；\n2) 语言难度控制在 ${level || "B1"} 水平，句子不过长；\n3) 每章 700-900 词英文，分 6-10 个自然段；\n4) 只输出英文正文，不要标题、不要中文、不要解释。`;
    const user = `题材：${genre || "悬疑"}；第 ${chapterNo || 1} 章。${prevSummary ? "前情提要：" + prevSummary : "这是第一章，请交代场景与主角。"}`;
    return await ask([{ role:"system", content: sys }, { role:"user", content: user }], { maxTokens: 2000, temperature: 0.9 });
  }
  async function reviewWriting(text){
    const sys = "你是英语写作老师。中文点评，分四部分：语法错误（逐条列出原句→改句→原因）、用词不当、表达不地道、改进建议。不要重写全文。";
    return await ask([{ role:"system", content: sys }, { role:"user", content: String(text).slice(0, 4000) }], { maxTokens: 1200, temperature: 0.3 });
  }
  async function storyFromWords(words, level){
    const w = (words || []).slice(0, 12).join(", ");
    const sys = `你是英语老师。用给定的单词写一个 ${level || "B1"} 难度的小故事，80-120 词，情节完整，句子简单。只输出英文正文。`;
    return await ask([{ role:"system", content: sys }, { role:"user", content: "单词：" + w }], { maxTokens: 500, temperature: 0.8 });
  }
  async function makeNews(topic, level, wordCount){
    const sys = `你是英语新闻编辑。写一篇关于「${topic}」的短文，${level || "B1"} 难度，约 ${wordCount || 180} 词，客观中立，不使用真实人物姓名与可识别细节。只输出英文正文。`;
    return await ask([{ role:"system", content: sys }, { role:"user", content: "开始写" }], { maxTokens: 700, temperature: 0.7 });
  }
  /* 自检：把每一步的真实结果都返回，方便定位"AI 用不了"到底是哪一环 */
  async function diagnose(){
    const lines = [];
    lines.push("站点：" + location.origin + location.pathname);
    lines.push("脚本版本：ai.js?v=6");
    lines.push("是否填了本机 Key：" + (userKey() ? "是" : "否"));
    lines.push("是否填了自定义后端：" + (userBase() || "否"));
    try{
      const reg = await navigator.serviceWorker?.getRegistration?.();
      lines.push("Service Worker：" + (reg ? "已注册（可能缓存旧文件，建议强制刷新）" : "无"));
    }catch(e){}
    const eps = endpoints();
    for(const ep of eps){
      const label = ep.replace(/^https?:\/\//, "").slice(0, 60);
      try{
        const hdrs = { "Content-Type": "application/json" };
        const uk = userKey(); if(uk) hdrs["x-user-key"] = uk;
        const r = await fetch(ep, {
          method:"POST", headers: hdrs,
          body: JSON.stringify({ messages:[{role:"user",content:"ping"}], max_tokens: 4 }),
          signal: AbortSignal.timeout(12000)
        });
        const txt = await r.text();
        let j = null; try{ j = JSON.parse(txt); }catch(e){}
        if(!r.ok) lines.push("· " + label + " → HTTP " + r.status);
        else if(j && j.configured) lines.push("· " + label + " → ✅ 可用");
        else lines.push("· " + label + " → ✗ " + ((j && j.message) || txt.slice(0, 60)));
      }catch(e){
        lines.push("· " + label + " → ✗ 连不上（" + (e.message || e) + "）");
      }
    }
    return lines.join("\n");
  }

  window.LZ_AI = {
    diagnose,
    setUserKey, hasUserKey, userKey, setUserBase, userBase, mode, probe, ask, explainWord, chatAboutBook, chatTutor, writeChapter, reviewWriting, storyFromWords, makeNews,
    get enabled(){ return !!_probe; } };
})();
