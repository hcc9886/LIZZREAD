/* LIZZREAD · AI 能力层（智谱 GLM-4-Flash）
   部署版走服务端 /api/ai/chat 代理（Key 只在服务端环境变量）；
   没有后端时自动退回本地生成，静态站也不会报错。 */
(function(){
  const ENDPOINTS = ["api/ai/chat", "public/api/ai/chat"];
  let _probe = null;
  const _cache = new Map();
  function keyOf(msgs){ return JSON.stringify(msgs).slice(0, 4000); }
  async function probe(){
    if(_probe !== null) return _probe;
    _probe = false;
    for(const ep of ENDPOINTS){
      try{
        const r = await fetch(ep, { method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ messages:[{ role:"user", content:"ping" }], max_tokens: 4 }),
          signal: AbortSignal.timeout(8000) });
        if(!r.ok) continue;
        const j = await r.json();
        if(j && j.configured){ _probe = true; break; }
      }catch(e){}
    }
    return _probe;
  }
  async function ask(messages, opt){
    opt = opt || {};
    if(!(await probe())) return null;
    const ck = keyOf(messages);
    if(!opt.noCache && _cache.has(ck)) return _cache.get(ck);
    for(const ep of ENDPOINTS){
      try{
        const r = await fetch(ep, { method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ messages, temperature: opt.temperature ?? 0.7, max_tokens: opt.maxTokens || 800 }),
          signal: AbortSignal.timeout(opt.timeout || 45000) });
        if(!r.ok) continue;
        const j = await r.json();
        if(j && j.ok && j.text){ if(!opt.noCache) _cache.set(ck, j.text); return j.text; }
      }catch(e){}
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
    const sys = `你是耐心的${langName}陪练。规则：\n1) 用${langName}回应用户，句子简单、贴近${scene || "日常"}场景；\n2) 每句${langName}后面用括号给出中文翻译；\n3) 用户打错时先自然回应，再用一行「小提示：」指出语法或用词问题；\n4) 每次回复不超过 3 句。`;
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
  window.LZ_AI = { probe, ask, explainWord, chatAboutBook, chatTutor, writeChapter, reviewWriting, storyFromWords, makeNews,
    get enabled(){ return _probe === true; } };
})();
