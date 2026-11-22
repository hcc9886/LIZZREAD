/* =====================================================================
   LIZZREAD —— 句子拼装面板（assembly-panel.js）
   自包含 UI。依赖 window.AssemblyCore。
   - 先看「这句话的意思 → 联系本文 → 换个地方怎么用」，再动手拼
   - 两种作答：点选/拖拽 意群块；键盘输入（用 / 或 | 分隔意群）
   - 提交后逐位反馈，错误块高亮，指出正确位置
   - 日志：IndexedDB（assembly_log_v2），带 duration_ms
   - 绝不自动展开；只能由用户主动触发
   ===================================================================== */
(function(global){
  'use strict';

  const AC = global.AssemblyCore;
  const ROLE_ZH = {
    subject:'主语', predicate:'谓语', copular:'系动词', auxiliary:'助动词',
    prep_phrase:'介词短语（时间/地点/方式）', clause:'从句', conjunction:'连词',
    infinitive:'不定式', participle:'分词短语', content:'内容词'
  };
  let state = null;
  let panelEl = null;

  function toast(msg){
    let el = document.getElementById('lzAsmToast');
    if(!el){
      el = document.createElement('div');
      el.id = 'lzAsmToast';
      el.style.cssText = 'position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:1300;'+
        'background:rgba(20,26,23,.92);color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;'+
        'max-width:88vw;line-height:1.5;box-shadow:0 10px 30px rgba(0,0,0,.3);display:none';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(()=>{ el.style.display = 'none'; }, 2600);
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function clip(s, n){
    s = String(s == null ? '' : s).trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function shuffle(arr){
    for(let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function ensurePanel(){
    if(panelEl) return panelEl;
    panelEl = document.createElement('div');
    panelEl.id = 'lzAssemblyPanel';
    panelEl.innerHTML = `
      <div id="lzAsmMask" style="position:fixed;inset:0;background:rgba(8,12,10,.48);z-index:1190;display:none"></div>
      <div id="lzAsmSheet" role="dialog" aria-modal="true" aria-label="句子拼装"
        style="position:fixed;left:50%;bottom:0;transform:translate(-50%,105%);width:100%;max-width:680px;
        max-height:90vh;overflow-y:auto;background:var(--surface);color:var(--text);z-index:1195;
        border-radius:18px 18px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.28);padding:18px 18px 22px;
        transition:transform .28s cubic-bezier(.4,0,.2,1)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="font:700 17px/1.3 var(--serif)">🧩 句子意群拼装</div>
          <span id="lzAsmBadge" style="font-size:11px;color:var(--muted)"></span>
          <button onclick="AssemblyPanel.close()" aria-label="关闭"
            style="margin-left:auto;background:none;border:none;font-size:24px;line-height:1;color:var(--muted);cursor:pointer">×</button>
        </div>
        <div id="lzAsmSource" style="font-size:12px;color:var(--muted);margin-bottom:10px"></div>
        <div id="lzAsmSent" style="background:var(--surface2);border-left:3px solid var(--brand);border-radius:10px;padding:12px 14px;margin-bottom:10px;
          font:16px/1.65 var(--serif)"></div>

        <div class="asmInfoGrid">
          <div class="asmInfo">
            <div class="asmInfoH">💬 这句话的意思</div>
            <div id="lzAsmMeaning" class="asmInfoB"></div>
          </div>
          <div class="asmInfo">
            <div class="asmInfoH">🧭 联系本文的意思</div>
            <div id="lzAsmContext" class="asmInfoB"></div>
          </div>
          <div class="asmInfo">
            <div class="asmInfoH">🌍 换个地方怎么用</div>
            <div id="lzAsmUsage" class="asmInfoB"></div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0 8px">
          <span style="font-size:12px;color:var(--muted)">作答方式</span>
          <div class="lzAsmSeg">
            <button data-mode="tap" class="on">点选 / 拖拽</button>
            <button data-mode="type">键盘输入</button>
          </div>
          <button id="lzAsmReset" class="lzAsmMini">↺ 重置</button>
          <button id="lzAsmHint" class="lzAsmMini">💡 提示一块</button>
        </div>

        <div id="lzAsmTapPane">
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">① 按正确语序把意群放到槽位（也可拖拽）</div>
          <div id="lzAsmSlots" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px"></div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">② 意群块（<span id="lzAsmLeft">0</span> 块待放）</div>
          <div id="lzAsmBlocks" style="display:flex;flex-wrap:wrap;gap:8px;padding:10px;background:var(--surface2);border-radius:10px;min-height:54px"></div>
        </div>

        <div id="lzAsmTypePane" style="display:none">
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">
            按意群顺序输入英文，用 <b>/</b> 或 <b>|</b> 分隔，例如：<code>It depends / on the weather</code>
          </div>
          <textarea id="lzAsmInput" rows="3" placeholder="It depends / on the weather"
            style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border);border-radius:10px;
            font:15px/1.6 var(--font);background:var(--surface);color:var(--text);outline:none"></textarea>
          <div style="font-size:12px;color:var(--muted);margin-top:6px">
            共 <span id="lzAsmChunkCount">0</span> 个意群；也可以直接按顺序输入。
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
          <button id="lzAsmSubmit" style="flex:1;min-width:150px;padding:11px 16px;background:var(--brand);color:#fff;
            border:none;border-radius:10px;font:600 15px var(--font);cursor:pointer">✅ 提交答案</button>
          <button id="lzAsmNext" class="lzAsmGhost">🎲 下一句</button>
          <button id="lzAsmSpeak" class="lzAsmGhost">🔊 朗读</button>
        </div>
        <div id="lzAsmResult" style="margin-top:12px;font-size:14px;line-height:1.7"></div>
        <div id="lzAsmFoot" style="margin-top:12px;font-size:11px;color:var(--muted)">
          记录保存在本机（IndexedDB）；不联网也能练已缓存的句子。
        </div>
      </div>
      <style>
        #lzAsmSheet .lzAsmSeg{display:inline-flex;border:1px solid var(--border);border-radius:9px;overflow:hidden}
        #lzAsmSheet .lzAsmSeg button{border:none;background:var(--surface);color:var(--muted);padding:6px 11px;font:12px var(--font);cursor:pointer}
        #lzAsmSheet .lzAsmSeg button.on{background:var(--brand);color:#fff}
        #lzAsmSheet .lzAsmMini{background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:6px 10px;font:12px var(--font);color:var(--text);cursor:pointer}
        #lzAsmSheet .lzAsmGhost{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:11px 14px;font:500 13px var(--font);color:var(--text);cursor:pointer}
        #lzAsmSheet .asmInfoGrid{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:4px}
        #lzAsmSheet .asmInfo{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:9px 12px}
        #lzAsmSheet .asmInfoH{font:600 12px/1.5 var(--font);color:var(--brand-deep);margin-bottom:4px;letter-spacing:.3px}
        #lzAsmSheet .asmInfoB{font-size:13px;line-height:1.7;color:var(--text)}
        #lzAsmSheet .asmInfoB .dim{color:var(--muted)}
        #lzAsmSheet .asmSlot{border:2px dashed var(--border);border-radius:10px;padding:9px 12px;display:flex;align-items:center;gap:8px;
          cursor:pointer;min-height:46px;font-size:14px;transition:border-color .15s,background .15s;box-sizing:border-box}
        #lzAsmSheet .asmSlot.filled{background:var(--brand-soft);border-style:solid;border-color:var(--brand);color:var(--brand-deep);font-weight:600}
        #lzAsmSheet .asmSlot.err{background:rgba(211,75,62,.1);border-color:var(--danger);color:var(--danger)}
        #lzAsmSheet .asmSlot.warn{background:rgba(185,138,47,.12);border-color:var(--gold);color:var(--gold)}
        #lzAsmSheet .asmSlot.good{border-color:var(--brand);background:var(--brand-soft)}
        #lzAsmSheet .asmBlock{background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:8px 12px;font:500 14px var(--font);
          color:var(--text);cursor:grab;user-select:none}
        #lzAsmSheet .asmBlock:hover{border-color:var(--brand);box-shadow:0 2px 8px rgba(15,138,77,.15)}
        @media (max-width:560px){ #lzAsmSheet .asmBlock{font-size:13px} }
      </style>`;
    document.body.appendChild(panelEl);
    panelEl.querySelector('#lzAsmMask').addEventListener('click', close);
    panelEl.querySelectorAll('.lzAsmSeg button').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    panelEl.querySelector('#lzAsmReset').addEventListener('click', reset);
    panelEl.querySelector('#lzAsmHint').addEventListener('click', showHint);
    panelEl.querySelector('#lzAsmSubmit').addEventListener('click', submit);
    panelEl.querySelector('#lzAsmNext').addEventListener('click', next);
    panelEl.querySelector('#lzAsmSpeak').addEventListener('click', speak);
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape' && state) close();
    });
    return panelEl;
  }

  /* ---------- 打开 ---------- */
  function openAssembly(sentence, word, ctx){
    if(!sentence || !AC){ toast('拼装数据不可用'); return; }
    ensurePanel();
    let chunks = (sentence.chunks && sentence.chunks.length >= 2)
      ? sentence.chunks.slice()
      : AC.splitIntoChunks(sentence.text || '');
    if(chunks.length < 2){
      const words = String(sentence.text || '').trim().split(/\s+/).filter(Boolean);
      if(words.length >= 2){
        const at = Math.max(1, Math.ceil(words.length / 2));
        chunks = [words.slice(0, at).join(' '), words.slice(at).join(' ')];
      }
    }
    chunks = chunks.map(c => String(c || '').trim()).filter(Boolean);
    if(chunks.length < 2){ toast('这句话太短，换一句再练。'); return; }
    const roles = (sentence.chunk_roles && sentence.chunk_roles.length === chunks.length)
      ? sentence.chunk_roles.slice()
      : AC.chunkRoles(chunks);
    if(sentence.zh && typeof global.lzUsableZh === 'function' && !global.lzUsableZh(sentence.text, sentence.zh)) sentence.zh = "";
    state = {
      sentence: Object.assign({}, sentence, { chunks, chunk_roles: roles }),
      chunks, roles,
      userChunks: new Array(chunks.length).fill(null),
      shuffled: shuffle(chunks.slice()),
      selected: word || (sentence.target_words && sentence.target_words[0]) || null,
      context: ctx || {},
      mode: 'tap',
      startedAt: Date.now(),
      attempts: 0,
      lastResult: null,
      showAnswer: false,
      revealUsed: false
    };
    const sheet = panelEl.querySelector('#lzAsmSheet');
    panelEl.querySelector('#lzAsmMask').style.display = 'block';
    requestAnimationFrame(() => { sheet.style.transform = 'translate(-50%, 0)'; });

    panelEl.querySelector('#lzAsmBadge').textContent = (sentence.level || 'B1') + ' · ' + chunks.length + ' 个意群';
    const isPack = /^book\d+_s\d+/.test(String(sentence.sentence_id || ''));
    panelEl.querySelector('#lzAsmSource').textContent = isPack
      ? ('📖 ' + (bookTitle(sentence.book_id) || sentence.book_id) + ' · ' + sentence.sentence_id)
      : ('📖 ' + (sentence.source || '当前阅读句'));
    panelEl.querySelector('#lzAsmSent').textContent = sentence.text || '';

    panelEl.querySelector('#lzAsmResult').innerHTML = '';
    panelEl.querySelector('#lzAsmInput').value = '';
    panelEl.querySelector('#lzAsmChunkCount').textContent = chunks.length;
    setMode('tap');
    renderInfo();
    render();
    /* 若本地没有译文，自动尝试缓存/翻译，不阻塞拼装 */
    if(!state.sentence.zh) hydrateZh();
  }

  function hydrateZh(){
    const s = state && state.sentence;
    if(!s || s.zh) return;
    const done = (t)=>{
      if(!state || state.sentence !== s || !t) return;
      if(typeof global.lzUsableZh === 'function' && !global.lzUsableZh(s.text, t)) return;
      s.zh = t;
      renderInfo();
      if(typeof global.__cacheSentenceZh === 'function') global.__cacheSentenceZh(s, t);
    };
    if(s.sentence_id && typeof global.kvGet === 'function'){
      global.kvGet('sentzh_' + s.sentence_id).then(t=>{ if(t) done(t); }).catch(()=>{});
    }
    if(typeof global.mtFetch === 'function'){
      global.mtFetch(s.text).then(done).catch(()=>{});
    }
  }

  /* ---------- 三块说明：本句意思 / 联系本文 / 其他用法 ---------- */
  function renderInfo(){
    if(!state) return;
    const s = state.sentence;
    const word = state.selected || (s.target_words && s.target_words[0]) || '';
    const meaning = panelEl.querySelector('#lzAsmMeaning');
    const context = panelEl.querySelector('#lzAsmContext');
    const usage = panelEl.querySelector('#lzAsmUsage');

    let mhtml = '';
    if(s.zh){
      mhtml += `<div>${esc(s.zh)}</div>`;
      /* 不直接给出英文答案；要核对就点「查看答案」 */
      mhtml += `<div class="dim" style="margin-top:6px">句子结构：${state.roles.map((r,i)=>
        `<b>${i+1}</b> ${esc(ROLE_ZH[r] || r)}`).join(' → ')}</div>`;
      mhtml += `<div style="margin-top:6px"><button class="lzAsmMini" id="lzAsmAnsBtn">${state.showAnswer ? '🙈 收起答案' : '👀 查看答案'}</button>
        ${state.showAnswer ? `<span style="margin-left:8px;color:var(--brand-deep);font-weight:600">${esc(fullAnswer())}</span>` : ``}</div>`;
    } else {
      mhtml += `<div class="dim">这句还没有译文。</div>
        <button class="lzAsmMini" id="lzAsmTrans" style="margin-top:6px">🌐 翻译这句话</button>`;
    }
    meaning.innerHTML = mhtml;
    const tb = meaning.querySelector('#lzAsmTrans');
    if(tb) tb.addEventListener('click', translate);
    const ab = meaning.querySelector('#lzAsmAnsBtn');
    if(ab) ab.addEventListener('click', toggleAnswer);

    /* 联系本文：上一句 / 下一句 / 章节 */
    const c = state.context || {};
    let chtml = '';
    if(c.chapter) chtml += `<div class="dim">章节：${esc(clip(c.chapter, 60))}</div>`;
    if(c.prev){
      chtml += `<div style="margin-top:4px"><span class="dim">上一句：</span>${esc(clip(c.prev, 120))}</div>`;
    }
    if(c.next){
      chtml += `<div style="margin-top:2px"><span class="dim">下一句：</span>${esc(clip(c.next, 120))}</div>`;
    }
    if(!c.prev && !c.next && !c.chapter){
      chtml = `<div class="dim">在阅读器里打开这句时，这里会显示上下文，帮助你理解它为什么这样断句。</div>`;
    }
    /* 这句话在段落里的作用 */
    chtml += `<div style="margin-top:6px">${esc(contextHint())}</div>`;
    context.innerHTML = chtml;

    /* 其他用法：目标词常用义 + 本地英英义项 + 意群角色提示 */
    let uhtml = '';
    if(word){
      let info = null;
      try{
        if(typeof global.lzWordInfo === 'function') info = global.lzWordInfo(word);
      }catch(e){}
      const d = info && info.def;
      const zh = info && info.zh;
      const senses = (info && info.senses) || [];
      uhtml += `<div><b>${esc(word)}</b>`;
      if(zh) uhtml += ` <span class="dim">常用义：${esc(zh)}</span>`;
      else if(d) uhtml += ` <span class="dim">常用义：${esc(d[0]+' '+d[1])}</span>`;
      uhtml += `</div>`;
      if(senses.length){
        uhtml += `<div class="dim" style="margin-top:4px">英英义项：${senses.slice(0,2).map(x=>esc(clip(x, 90))).join('；')}</div>`;
      }
      uhtml += `<div style="margin-top:4px"><a href="https://dict.youdao.com/w/${encodeURIComponent(word)}" target="_blank" rel="noopener"
        style="color:var(--brand-deep)">更多释义 / 例句 ↗</a></div>`;
    }
    uhtml += `<div class="dim" style="margin-top:6px">${esc(usageHint())}</div>`;
    usage.innerHTML = uhtml;
  }

  function contextHint(){
    const roles = state.roles || [];
    if(roles.includes('clause')) return '这句话里有意群是从句：它补充说明前面的名词或动作，单独挪动会改变修饰对象。';
    if(roles.includes('prep_phrase')) return '这句话里有介词短语：它说明时间、地点或方式；理解时先找主干，再把介词短语当作附加信息。';
    if(roles.includes('conjunction')) return '这句话里有并列连词：前后两个意群地位相当，注意保持两边结构平衡。';
    return '先把主语和谓语（谁做什么）找出来，再把时间、地点、原因等附加意群按顺序挂上去。';
  }
  function usageHint(){
    const roles = [...new Set(state.roles || [])];
    const tips = {
      subject:'主语：动作的发出者，通常放在句首。',
      predicate:'谓语：句子的核心动作或状态。',
      copular:'系动词：连接主语和表语，说明“是什么/怎么样”。',
      auxiliary:'助动词：和主要动词一起构成时态、语态。',
      prep_phrase:'介词短语：可整体移到句首或句尾，意义基本不变。',
      clause:'从句：可以前置强调，也可以留在原位补充说明。',
      conjunction:'连词：连接两个并列或转折的意群。',
      infinitive:'不定式：表示目的或将来动作，常跟在动词/形容词后。',
      participle:'分词短语：可作定语或状语，注意逻辑主语。',
      content:'内容词：补充细节，通常是名词或修饰语。'
    };
    const lines = roles.map(r=>tips[r]).filter(Boolean);
    return lines.length ? ('这个意群在别处也会这样用：' + lines.join(' ')) : '';
  }

  function bookTitle(bookId){
    const m = String(bookId || '').match(/^book0*(\d+)/);
    const gb = m ? Number(m[1]) : 0;
    const b = (global.BOOKS || []).find(x => x.gb === gb);
    return b ? (b.zh || b.t) : '';
  }

  /* ---------- 先自己拼，再核对答案 ---------- */
  function toggleAnswer(){
    if(!state) return;
    state.showAnswer = !state.showAnswer;
    if(state.showAnswer) state.revealUsed = true;
    renderInfo();
  }
  function fullAnswer(){ return (state.chunks || []).join(' '); }

  /* ---------- 关闭 ---------- */
  function close(){
    const sheet = panelEl && panelEl.querySelector('#lzAsmSheet');
    const mask = panelEl && panelEl.querySelector('#lzAsmMask');
    if(!sheet) return;
    sheet.style.transform = 'translate(-50%, 105%)';
    setTimeout(() => { if(mask) mask.style.display = 'none'; }, 280);
    state = null;
  }

  /* ---------- 模式 ---------- */
  function setMode(mode){
    if(!state) return;
    state.mode = mode === 'type' ? 'type' : 'tap';
    panelEl.querySelectorAll('.lzAsmSeg button').forEach(b => {
      b.classList.toggle('on', b.dataset.mode === state.mode);
    });
    panelEl.querySelector('#lzAsmTapPane').style.display = state.mode === 'tap' ? 'block' : 'none';
    panelEl.querySelector('#lzAsmTypePane').style.display = state.mode === 'type' ? 'block' : 'none';
  }

  /* ---------- 渲染 ---------- */
  function render(){
    if(!state) return;
    const slots = panelEl.querySelector('#lzAsmSlots');
    const blocks = panelEl.querySelector('#lzAsmBlocks');
    const res = state.lastResult;
    slots.innerHTML = '';
    state.chunks.forEach((c, i) => {
      const v = state.userChunks[i];
      let cls = v ? 'filled' : '';
      let extra = '';
      if(res && res.details){
        const d = res.details.find(x => x.index === i);
        if(d){
          cls += d.type === 'spelling' ? ' warn' : ' err';
          extra = '<span style="margin-left:auto;font-size:11px">' + (d.type === 'spelling' ? '拼写' : d.type === 'order' ? '顺序' : '✕') + '</span>';
        } else if(res.result === 'EXACT') cls += ' good';
        else if(v) cls += ' good';
      }
      const el = document.createElement('div');
      el.className = 'asmSlot ' + cls;
      el.dataset.idx = String(i);
      el.style.cssText = 'display:flex;align-items:center;gap:8px';
      el.innerHTML = '<span style="min-width:18px;font-size:11px;opacity:.7">' + (i + 1) + '</span>' +
        '<span style="flex:1;word-break:break-word">' + (v ? esc(c) : '<span style="color:var(--muted);font-weight:400">把意群放到这里</span>') + '</span>' + extra;
      el.onclick = () => {
        if(state.userChunks[i]){ state.userChunks[i] = null; state.lastResult = null; render(); }
      };
      el.ondragover = e => { e.preventDefault(); el.style.borderColor = 'var(--brand)'; };
      el.ondragleave = () => { if(!state.userChunks[i]) el.style.borderColor = 'var(--border)'; };
      el.ondrop = e => {
        e.preventDefault();
        const idx = Number(e.dataTransfer.getData('text/plain'));
        if(Number.isFinite(idx)) putFromBlock(idx, i);
      };
      slots.appendChild(el);
    });

    const used = new Set(state.userChunks.filter(Boolean));
    const left = state.shuffled.map((c, idx) => ({ c, idx })).filter(x => !used.has(x.c));
    panelEl.querySelector('#lzAsmLeft').textContent = String(left.length);
    blocks.innerHTML = left.length ? '' : '<span style="color:var(--muted);font-size:13px">全部放好了 ✨ 点提交看结果</span>';
    left.forEach(({ c, idx }) => {
      const b = document.createElement('button');
      b.className = 'asmBlock';
      b.type = 'button';
      b.textContent = c;
      b.draggable = true;
      b.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', String(idx)));
      b.addEventListener('click', () => {
        const empty = state.userChunks.findIndex(x => !x);
        if(empty < 0) return;
        state.lastResult = null;
        state.userChunks[empty] = c;
        render();
      });
      blocks.appendChild(b);
    });
    panelEl.querySelector('#lzAsmResult').innerHTML = res ? resultHtml(res) : '';
  }

  function putFromBlock(blockIdx, slotIdx){
    if(!state) return;
    if(state.userChunks[slotIdx]) return;
    const c = state.shuffled[blockIdx];
    if(!c || state.userChunks.includes(c)) return;
    state.userChunks[slotIdx] = c;
    state.lastResult = null;
    render();
  }

  function resultHtml(res){
    const map = {
      EXACT: ['完全正确！语序和意群都对了。', 'var(--brand)'],
      SPELLING: ['接近正确，只是有拼写小问题。', 'var(--gold)'],
      ORDER_ERROR: ['意群顺序需要调整。', 'var(--gold)'],
      MIXED: ['顺序和内容都有需要调整的地方。', 'var(--danger)'],
      OTHER: ['还不完全正确，看看提示再试一次。', 'var(--danger)']
    };
    const [msg, color] = map[res.result] || ['结果', 'var(--text)'];
    const details = (res.details || []).map(d => '<div style="margin-top:4px;color:var(--muted)">· ' + esc(d.hint) + '</div>').join('');
    return '<div style="font-weight:700;color:' + color + '">' + msg + '</div>' +
      '<div style="color:var(--muted);font-size:13px;margin-top:2px">' + esc(res.hint || '') + '</div>' + details;
  }

  /* ---------- 提交 ---------- */
  function submit(){
    if(!state) return;
    let userChunks;
    if(state.mode === 'type'){
      const raw = panelEl.querySelector('#lzAsmInput').value.trim();
      if(!raw){ toast('先输入你的答案，用 / 分隔意群'); return; }
      userChunks = raw.split(/[\/|｜]+/).map(s => s.trim()).filter(Boolean);
      state.userChunks = userChunks.slice(0, state.chunks.length);
      while(state.userChunks.length < state.chunks.length) state.userChunks.push(null);
    } else {
      userChunks = state.userChunks.slice();
      if(userChunks.some(x => !x)){ toast('还有槽位没放意群，先把所有块放进去。'); return; }
    }
    if(state.revealUsed){
      panelEl.querySelector('#lzAsmResult').innerHTML = '<div style="color:var(--danger)">这次看过答案了，不计分；点「↺ 重置」再来一次。</div>';
      return;
    }
    const res = AC.judgeAssembly(userChunks, state.chunks);
    state.lastResult = res;
    state.showAnswer = false;
    state.attempts += 1;
    const duration = Date.now() - state.startedAt;
    render();
    const log = AC.recordAssembly({
      sentence_id: state.sentence.sentence_id || ('inline_' + Date.now()),
      book_id: state.sentence.book_id || '',
      level: state.sentence.level || '',
      user_chunks: userChunks,
      target_chunks: state.chunks,
      result: res.result,
      error_type: res.errorType,
      error_count: (res.details || []).length,
      duration_ms: duration,
      source: state.sentence.custom ? 'reader_inline' : 'sentence_pack'
    });
    if(res.result === 'EXACT'){
      if(typeof global.onAssemblySuccess === 'function') global.onAssemblySuccess(state.selected || null, state.sentence);
      state.startedAt = Date.now();
    }
    if(typeof global.onAssemblyAttempt === 'function'){
      try{ global.onAssemblyAttempt(res, log); }catch(e){}
    }
  }

  function reset(){
    if(!state) return;
    state.userChunks = new Array(state.chunks.length).fill(null);
    state.shuffled = shuffle(state.chunks.slice());
    state.lastResult = null;
    state.showAnswer = false;
    state.revealUsed = false;
    state.startedAt = Date.now();
    render();
    renderInfo();
  }

  function showHint(){
    if(!state) return;
    if(state.revealUsed){
      toast('已经看过答案，这次不计入统计，点「重置」可以重新做。');
      return;
    }
    const first = state.userChunks.findIndex(x => !x);
    if(first >= 0){
      state.revealUsed = true;
      state.userChunks[first] = state.chunks[first];
      state.lastResult = null;
      render();
      renderInfo();
      toast('已揭示第 ' + (first + 1) + ' 块（本次不计分）');
    } else {
      toast('所有槽位都填满了，直接提交看结果。');
    }
  }

  function next(){
    if(!state) return;
    const bookId = state.sentence.book_id;
    /* 没有书内句子包（导入书/离线壳）时，用当前句所在章节的相邻句作「下一句」 */
    if(!bookId || typeof BOOKS_SENT_POOL !== 'function') return;
    if(AC && bookId){
      AC.loadBookSentences(bookId).then(arr => {
        const pool = arr.filter(s => s.text && s.text.length > 18 && /[A-Za-z]{4,}/.test(s.text));
        if(!pool.length) return;
        let pick;
        if(pool.length > 1){
          do{ pick = pool[Math.floor(Math.random() * pool.length)]; }
          while(pick.sentence_id === state.sentence.sentence_id);
        } else pick = pool[0];
        const i = arr.indexOf(pick);
        const ctx = {
          prev: arr[i-1] ? arr[i-1].text : '',
          next: arr[i+1] ? arr[i+1].text : '',
          chapter: '',
          word: state.selected
        };
        openAssembly(pick, state.selected, ctx);
      }).catch(()=>{});
      return;
    }
    if(typeof global.asmNewRandom === 'function') global.asmNewRandom();
  }

  function speak(){
    if(!state) return;
    if(typeof global.speakText === 'function') global.speakText(state.sentence.text);
  }

  function translate(){
    if(!state) return;
    const el = panelEl.querySelector('#lzAsmMeaning');
    if(typeof global.mtFetch !== 'function'){ el.textContent = '翻译模块未就绪'; return; }
    el.innerHTML = '<span style="color:var(--muted)">翻译中…</span>';
    global.mtFetch(state.sentence.text).then(t => {
      state.sentence.zh = t;
      if(typeof global.__cacheSentenceZh === 'function') global.__cacheSentenceZh(state.sentence, t);
      renderInfo();
    }).catch(e => {
      el.innerHTML = '<span style="color:var(--danger)">翻译失败：' + esc(e.message || e) + '</span> ' +
        '<button class="lzAsmMini" id="lzAsmRetry" style="margin-top:6px">重试</button>';
      const b = panelEl.querySelector('#lzAsmRetry');
      if(b) b.addEventListener('click', translate);
    });
  }

  function recentLogs(limit){ return AC.recentLogs(limit || 20); }

  global.AssemblyPanel = {
    openAssembly, close, reset, showHint, submit, next, speak, translate, toast, recentLogs,
    get state(){ return state; }
  };
  global.openAssembly = openAssembly;

})(typeof window !== 'undefined' ? window : globalThis);
