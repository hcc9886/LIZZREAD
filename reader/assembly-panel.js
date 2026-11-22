/* =====================================================================
   LIZZREAD —— 句子拼装面板（assembly-panel.js）
   自包含 UI 组件。依赖 AssemblyCore。
   运行时零 API 调用（zh 已由构建脚本缓存或空值）。
   ===================================================================== */

(function(global){
  'use strict';

  const AC = global.AssemblyCore;
  if(!AC){ console.warn("assembly-panel: AssemblyCore 未加载"); }

  /* ---------- 状态 ---------- */
  let _currentSentence = null;     // 当前句子对象
  let _currentChunks = [];         // 意群数组
  let _userChunks = [];            // 用户提交的意群
  let _elPool = [];                // 可拖拽块 DOM 元素池
  let _selectedWord = null;        // 触发拼装的生词

  /* ---------- 确保面板 DOM 存在 ---------- */
  function ensurePanel(){
    let panel = document.getElementById("lzAssemblyPanel");
    if(panel) return panel;

    panel = document.createElement("div");
    panel.id = "lzAssemblyPanel";
    panel.innerHTML = `
      <div id="lzAsstMask" style="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:998;display:none" onclick="AssemblyPanel.close()"></div>
      <div id="lzAsst" style="position:fixed;bottom:0;left:0;right:0;max-height:85vh;overflow-y:auto;
        background:var(--surface);border-radius:16px 16px 0 0;z-index:999;box-shadow:0 -4px 30px rgba(0,0,0,.2);
        transform:translateY(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);
        padding:20px;max-width:640px;margin:0 auto">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font:700 16px var(--font);color:var(--brand-deep)">🧩 句子意群拼装</div>
          <button onclick="AssemblyPanel.close()" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--muted)">×</button>
        </div>
        <div id="lzAsstSentInfo" style="font-size:13px;color:var(--muted);margin-bottom:8px"></div>
        <div id="lzAsstZh" style="font-size:14px;color:var(--text);padding:10px 12px;background:var(--surface2);border-radius:8px;margin-bottom:14px;line-height:1.6"></div>

        <div style="font-size:13px;color:var(--muted);margin-bottom:6px">按正确顺序拖动下方意群块：</div>
        <div id="lzAsstSlots" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;min-height:120px">
          <!-- 槽位由 JS 填充 -->
        </div>

        <div style="font-size:13px;color:var(--muted);margin-bottom:6px">意群块（点击选中 → 再点槽位放入；或直接拖拽）：</div>
        <div id="lzAsstBlocks" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;padding:10px;background:var(--surface2);border-radius:8px;min-height:60px">
          <!-- 块由 JS 填充 -->
        </div>

        <div style="display:flex;gap:10px;margin-top:10px">
          <button id="lzAsstSubmit" onclick="AssemblyPanel.submit()" style="flex:1;padding:12px;background:var(--brand);color:#fff;border:none;border-radius:10px;font:600 15px var(--font);cursor:pointer">✅ 提交答案</button>
          <button onclick="AssemblyPanel.reset()" style="padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;font:500 14px var(--font);cursor:pointer;color:var(--text)">↺ 重置</button>
          <button onclick="AssemblyPanel.showHint()" style="padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;font:500 14px var(--font);cursor:pointer;color:var(--muted)">💡 提示</button>
        </div>
        <div id="lzAsstResult" style="margin-top:14px;font-size:14px;min-height:40px;line-height:1.6"></div>
      </div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  /* ---------- 打开面板 ---------- */
  function openAssembly(sentence, word){
    if(!sentence || !AC) return;
    ensurePanel();

    _currentSentence = sentence;
    _currentChunks = sentence.chunks.slice();
    _selectedWord = word || null;
    _userChunks = new Array(_currentChunks.length).fill(null);

    // 打乱顺序
    const shuffled = _currentChunks.slice().sort(() => Math.random() - 0.5);
    _shuffledBlocks = shuffled;

    render();

    const panel = document.getElementById("lzAsst");
    const mask = document.getElementById("lzAsstMask");
    mask.style.display = "block";
    requestAnimationFrame(() => { panel.style.transform = "translateY(0)"; });
  }

  /* ---------- 关闭面板 ---------- */
  function close(){
    const panel = document.getElementById("lzAsst");
    const mask = document.getElementById("lzAsstMask");
    if(!panel) return;
    panel.style.transform = "translateY(100%)";
    setTimeout(() => { mask.style.display = "none"; }, 300);
    _currentSentence = null;
    _currentChunks = [];
    _userChunks = [];
    _selectedWord = null;
  }

  /* ---------- 渲染 ---------- */
  let _shuffledBlocks = [];

  function render(){
    const s = _currentSentence;
    if(!s) return;

    // 句子信息
    document.getElementById("lzAsstSentInfo").textContent =
      `📖 ${s.book_id} · ${s.sentence_id} · ${s.level} · 词数 ${s.chunks.length} 个意群`;

    // 中文提示（构建时缓存的 zh，空则运行时展示英文原句）
    const zhEl = document.getElementById("lzAsstZh");
    if(s.zh){ zhEl.textContent = "💬 " + s.zh; }
    else { zhEl.textContent = "💬 " + s.text + "（请按语义分块）"; }

    // 渲染槽位
    const slotsEl = document.getElementById("lzAsstSlots");
    slotsEl.innerHTML = "";
    _userChunks.forEach((chunk, i) => {
      const slot = document.createElement("div");
      slot.className = "lzAsstSlot";
      slot.dataset.idx = i;
      slot.style.cssText = `min-height:48px;border:2px dashed var(--border);border-radius:10px;
        padding:8px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;
        background:${chunk ? "var(--brand-soft)" : "transparent"};transition:all .15s`;
      if(chunk){
        slot.innerHTML = `<span style="font:600 14px var(--font);color:var(--brand-deep)">${chunk}</span>
          <span style="margin-left:auto;color:var(--muted);font-size:12px">✕</span>`;
        slot.onclick = () => removeFromSlot(i);
      } else {
        slot.innerHTML = `<span style="color:var(--muted);font-size:13px">槽位 ${i+1}：点下方意群块放入这里</span>`;
        slot.onclick = () => tryDropSelected(i);
      }
      slotsEl.appendChild(slot);
    });

    // 渲染块（打乱后，未放入槽位的才显示）
    const blocksEl = document.getElementById("lzAsstBlocks");
    blocksEl.innerHTML = "";
    const usedChunks = new Set(_userChunks.filter(Boolean));

    // 用已打乱的顺序，但过滤掉已用的
    const remainingShuffled = _shuffledBlocks.filter(b => !usedChunks.has(b));
    remainingShuffled.forEach((chunk, idx) => {
      const block = document.createElement("div");
      block.className = "lzAsstBlock";
      block.textContent = chunk;
      block.dataset.chunk = chunk;
      block.style.cssText = `padding:8px 14px;background:var(--surface);border:1px solid var(--border);
        border-radius:8px;cursor:pointer;font:500 14px var(--font);transition:all .15s;
        user-select:none`;
      block.onmouseenter = () => { block.style.borderColor = "var(--brand)"; block.style.boxShadow = "0 2px 8px rgba(15,138,77,.15)"; };
      block.onmouseleave = () => { block.style.borderColor = "var(--border)"; block.style.boxShadow = "none"; };
      block.onclick = () => putInFirstSlot(chunk);
      block.draggable = true;
      block.ondragstart = e => { e.dataTransfer.setData("chunk", chunk); };
      blocksEl.appendChild(block);
    });

    if(remainingShuffled.length === 0){
      blocksEl.innerHTML = `<span style="color:var(--muted);font-size:13px">所有意群块已放入槽位 ✨</span>`;
    }

    // 清除结果
    document.getElementById("lzAsstResult").innerHTML = "";
  }

  let _dragChunk = null;

  // 允许槽位接收拖拽
  document.addEventListener("dragover", e => {
    const slot = e.target.closest(".lzAsstSlot");
    if(slot && !_userChunks[+slot.dataset.idx]){ e.preventDefault(); slot.style.borderColor = "var(--brand)"; slot.style.background = "var(--brand-soft)"; }
  });
  document.addEventListener("dragleave", e => {
    const slot = e.target.closest(".lzAsstSlot");
    if(slot && !_userChunks[+slot.dataset.idx]){ slot.style.borderColor = "var(--border)"; slot.style.background = "transparent"; }
  });
  document.addEventListener("drop", e => {
    const slot = e.target.closest(".lzAsstSlot");
    if(!slot) return;
    e.preventDefault();
    const chunk = e.dataTransfer.getData("chunk");
    if(chunk && !_userChunks[+slot.dataset.idx]){
      putInSlot(chunk, +slot.dataset.idx);
      slot.style.borderColor = "var(--border)"; slot.style.background = "transparent";
    }
  });

  /* ---------- 交互函数 ---------- */
  function putInSlot(chunk, idx){
    if(_userChunks.includes(chunk)) return;  // 已在某处
    _userChunks[idx] = chunk;
    render();
  }

  function putInFirstSlot(chunk){
    if(_userChunks.includes(chunk)) return;
    const firstEmpty = _userChunks.findIndex(x => x === null);
    if(firstEmpty >= 0) putInSlot(chunk, firstEmpty);
  }

  function removeFromSlot(idx){
    _userChunks[idx] = null;
    render();
  }

  function tryDropSelected(idx){
    // 点击空槽位 → 找第一个未放入的块
    const usedChunks = new Set(_userChunks.filter(Boolean));
    const available = _shuffledBlocks.find(b => !usedChunks.has(b));
    if(available) putInSlot(available, idx);
  }

  /* ---------- 提交判定 ---------- */
  function submit(){
    const resultEl = document.getElementById("lzAsstResult");
    if(_userChunks.some(x => x === null)){
      resultEl.innerHTML = `<span style="color:var(--danger)">⚠️ 请先把所有意群块放入槽位</span>`;
      return;
    }

    const result = AC.judgeAssembly(_userChunks, _currentChunks);

    // 记录日志
    AC.recordAssembly({
      sentence_id: _currentSentence.sentence_id,
      user_chunks: _userChunks,
      target_chunks: _currentChunks,
      result: result.result,
      error_type: result.error_type,
      timestamp: Date.now()
    });

    // UI 反馈
    const colorMap = {
      EXACT: "var(--brand)",
      SPELLING: "var(--gold)",
      ORDER_ERROR: "var(--gold)",
      MIXED: "var(--danger)",
      OTHER: "var(--danger)"
    };
    const emojiMap = {
      EXACT: "🎉 完全正确！",
      SPELLING: "📝 拼写小问题",
      ORDER_ERROR: "🔀 顺序不对",
      MIXED: "⚠️ 有多处错误",
      OTHER: "❌ 不太对"
    };

    resultEl.innerHTML = `<div style="font-size:16px;font-weight:600;color:${colorMap[result.result]};margin-bottom:6px">${emojiMap[result.result]}</div>
      <div style="color:var(--muted);font-size:13px">${result.hint || ""}</div>`;

    // EXACT 时自动标记生词为已掌握
    if(result.result === "EXACT" && _selectedWord){
      // 触发外部回调（由 index.html 注入）
      if(typeof global.onAssemblySuccess === "function"){
        global.onAssemblySuccess(_selectedWord);
      }
    }
  }

  function reset(){
    _userChunks = new Array(_currentChunks.length).fill(null);
    _shuffledBlocks = _currentChunks.slice().sort(() => Math.random() - 0.5);
    render();
  }

  function showHint(){
    // 先放正确的第一个块
    if(!_userChunks[0]){
      _userChunks[0] = _currentChunks[0];
      render();
    } else if(!_userChunks[_currentChunks.length-1]){
      _userChunks[_currentChunks.length-1] = _currentChunks[_currentChunks.length-1];
      render();
    } else {
      // 揭示一个剩余的正确块位置
      for(let i=0;i<_currentChunks.length;i++){
        if(!_userChunks[i]){ _userChunks[i] = _currentChunks[i]; render(); break; }
      }
    }
  }

  /* ---------- 暴露接口 ---------- */
  global.AssemblyPanel = { openAssembly, close, reset, showHint, submit };

})(typeof window !== "undefined" ? window : globalThis);
