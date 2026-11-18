/* LIZZREAD 点词翻译 · 任意网站可开关的点词翻译
   功能：单击单词 → 音标 / 中文 / 英英释义 / 发音；选中一段 → 整句翻译
   开关：右下角「译」按钮、Alt+T、扩展弹窗；状态按站点记忆 */
(() => {
  if (window.__LZ_TAG) return;
  window.__LZ_TAG = true;

  const SITE = location.hostname || "local";
  const isTop = window.top === window.self;
  let enabled = false;
  let selText = "";
  let bubble = null;
  let card = null;
  let lastWord = "";

  /* ---------- Shadow DOM 容器 ---------- */
  const host = document.createElement("div");
  host.id = "lz-translate-host";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>
    :host{ all:initial; }
    *{ box-sizing:border-box; margin:0; padding:0; font-family:-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif; }
    .pill{
      position:fixed; right:18px; bottom:18px; z-index:2147483000;
      display:flex; align-items:center; gap:6px; height:38px; padding:0 13px 0 10px;
      border-radius:999px; background:#fff; color:#5b6360; cursor:pointer; user-select:none;
      box-shadow:0 6px 20px rgba(0,0,0,.16); border:1px solid rgba(0,0,0,.08);
      font-size:13px; font-weight:600; letter-spacing:.4px; transition:all .18s;
    }
    .pill:hover{ transform:translateY(-1px); }
    .pill .dot{ width:8px; height:8px; border-radius:50%; background:#b9c0bc; }
    .pill.on{ background:#0F8A4D; color:#fff; border-color:#0F8A4D; }
    .pill.on .dot{ background:#8ff0bd; box-shadow:0 0 0 3px rgba(143,240,189,.25); }
    .bubble{
      position:fixed; z-index:2147483000; display:flex; gap:8px; align-items:center;
      background:#1b1f1d; color:#fff; border-radius:999px; padding:7px 12px; font-size:13px;
      box-shadow:0 8px 24px rgba(0,0,0,.28); cursor:pointer;
    }
    .bubble b{ color:#8ff0bd; font-weight:600; }
    .card{
      position:fixed; z-index:2147483000; width:326px; max-width:calc(100vw - 24px);
      background:#fff; color:#1b1f1d; border-radius:14px; overflow:hidden;
      box-shadow:0 12px 40px rgba(0,0,0,.22),0 2px 6px rgba(0,0,0,.08);
      border:1px solid rgba(0,0,0,.08); font-size:14px; line-height:1.55;
    }
    .card[hidden]{ display:none; }
    .head{ display:flex; align-items:baseline; gap:8px; padding:12px 12px 8px; flex-wrap:wrap; }
    .head .w{ font-size:20px; font-weight:700; font-family:Georgia,serif; word-break:break-word; }
    .head .ipa{ color:#7c8581; font-size:13px; }
    .head .spk,.head .x{
      border:none; background:transparent; cursor:pointer; font-size:15px; color:#6b7370; padding:2px 4px;
      border-radius:6px;
    }
    .head .spk:hover,.head .x:hover{ background:#f1f3f1; }
    .head .x{ margin-left:auto; }
    .body{ padding:0 12px 10px; }
    .zh{ font-size:15px; color:#0B6B3C; font-weight:600; margin-bottom:6px; word-break:break-word; }
    .zh.loading{ color:#98a09b; font-weight:400; }
    .pos{ display:inline-block; font-size:11px; color:#8a7a55; background:#f6f0df; border-radius:999px;
      padding:1px 7px; margin-bottom:5px; }
    .def{ color:#4b524f; font-size:13px; max-height:96px; overflow:auto; }
    .orig{ color:#6b7370; font-size:12.5px; border-left:3px solid #e4e7e3; padding-left:8px; margin-bottom:8px;
      max-height:80px; overflow:auto; }
    .foot{ display:flex; align-items:center; gap:8px; padding:8px 12px; border-top:1px solid #eef0ed;
      font-size:11.5px; color:#9aa29d; }
    .foot a{ color:#0F8A4D; text-decoration:none; margin-left:auto; font-weight:600; }
    .foot .k{ margin-left:auto; }
    @media (prefers-color-scheme: dark){
      .pill{ background:#21262a; color:#c9d0cc; border-color:#333a3d; }
      .card{ background:#1f2422; color:#e6ebe8; border-color:#333a37; }
      .head .spk,.head .x{ color:#9aa29d; }
      .head .spk:hover,.head .x:hover{ background:#2b312e; }
      .def{ color:#b9c2bd; }
      .foot{ border-top-color:#2c332f; }
      .orig{ border-left-color:#343b37; color:#98a09b; }
    }
  </style>
  <div class="pill" hidden title="点击开关点词翻译（Alt+T）"><span class="dot"></span><span class="t">译</span></div>
  <div class="card" hidden>
    <div class="head"><b class="w"></b><span class="ipa"></span>
      <button class="spk" title="朗读">🔊</button><button class="x" title="关闭">✕</button></div>
    <div class="body">
      <div class="orig" hidden></div>
      <div class="zh loading">查询中…</div>
      <div class="pos" hidden></div>
      <div class="def" hidden></div>
    </div>
    <div class="foot"><span>LIZZREAD 点词翻译</span><span class="k" hidden>Alt+T 开关</span><a class="open" hidden>打开链接 ↗</a></div>
  </div>`;

  const pill = root.querySelector(".pill");
  const cardEl = root.querySelector(".card");
  const wEl = root.querySelector(".head .w");
  const ipaEl = root.querySelector(".head .ipa");
  const zhEl = root.querySelector(".zh");
  const posEl = root.querySelector(".pos");
  const defEl = root.querySelector(".def");
  const origEl = root.querySelector(".orig");
  const openEl = root.querySelector(".open");

  document.documentElement.appendChild(host);

  /* ---------- 开关状态：按站点记忆 ---------- */
  async function loadState() {
    try {
      const st = await chrome.storage.local.get(["defaultOn", "sites"]);
      const sites = st.sites || {};
      enabled = Object.prototype.hasOwnProperty.call(sites, SITE) ? !!sites[SITE] : !!st.defaultOn;
    } catch (e) { enabled = false; }
    renderPill();
  }
  function saveState() {
    try {
      chrome.storage.local.get(["sites"]).then(st => {
        const sites = st.sites || {};
        sites[SITE] = enabled;
        chrome.storage.local.set({ sites });
      });
    } catch (e) {}
  }
  function renderPill() {
    if (!isTop) { pill.hidden = true; return; }
    pill.hidden = false;
    pill.classList.toggle("on", enabled);
    pill.querySelector(".t").textContent = enabled ? "译开" : "译关";
    pill.title = enabled ? "点词翻译已开启 · 点击关闭（Alt+T）" : "点词翻译已关闭 · 点击开启（Alt+T）";
    if (!enabled) hideCard();
  }
  function toggle() {
    enabled = !enabled;
    saveState();
    renderPill();
    hideBubble();
  }
  pill.addEventListener("click", e => { e.stopPropagation(); toggle(); });

  try {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== "local" || !ch.sites) return;
      const sites = ch.sites.newValue || {};
      enabled = Object.prototype.hasOwnProperty.call(sites, SITE) ? !!sites[SITE] : enabled;
      renderPill();
    });
    chrome.runtime.onMessage.addListener((msg, s, reply) => {
      if (!msg) return;
      if (msg.type === "toggle") { toggle(); if (reply) reply({ enabled }); }
      if (msg.type === "set") { enabled = !!msg.enabled; saveState(); renderPill(); if (reply) reply({ enabled }); }
      if (msg.type === "getState") { if (reply) reply({ enabled, site: SITE }); }
    });
  } catch (e) {}

  /* Alt+T 兜底（部分站点会拦截扩展快捷键） */
  document.addEventListener("keydown", e => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "t" || e.key === "T")) {
      e.preventDefault();
      toggle();
    }
    if (e.key === "Escape") { hideCard(); hideBubble(); }
  }, true);

  /* ---------- 取词 ---------- */
  const WORDCH = /[\p{L}\p{M}'’\-]/u;
  function caretAt(x, y) {
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) return { node: p.offsetNode, off: p.offset };
    }
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) return { node: r.startContainer, off: r.startOffset };
    }
    return null;
  }
  function wordAt(x, y) {
    const c = caretAt(x, y);
    if (!c || !c.node || c.node.nodeType !== 3) return null;
    const parent = c.node.parentElement;
    if (!parent || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT)$/.test(parent.tagName)) return null;
    const txt = c.node.nodeValue || "";
    if (!txt) return null;
    let s = Math.min(c.off, txt.length), e = s;
    if (!WORDCH.test(txt[s] || "") && s > 0 && WORDCH.test(txt[s - 1])) { s -= 1; e = s + 1; }
    if (!WORDCH.test(txt[s] || "")) return null;
    while (s > 0 && WORDCH.test(txt[s - 1])) s--;
    while (e < txt.length && WORDCH.test(txt[e])) e++;
    const word = txt.slice(s, e).replace(/^[-'’]+|[-'’]+$/g, "");
    if (word.length < 2 || !/[A-Za-zÀ-ÿ]/.test(word)) return null;
    const range = document.createRange();
    range.setStart(c.node, s);
    range.setEnd(c.node, e);
    const rect = range.getBoundingClientRect();
    return { word, rect, link: parent.closest("a") };
  }

  /* ---------- 卡片 ---------- */
  function placeCard(x, y, w) {
    const width = Math.min(326, window.innerWidth - 24);
    let left = Math.min(Math.max(12, x - width / 2), window.innerWidth - width - 12);
    const estH = 190;
    let top = y + 14;
    if (top + estH > window.innerHeight - 12) top = Math.max(12, y - estH - 12);
    cardEl.style.left = left + "px";
    cardEl.style.top = top + "px";
    cardEl.style.width = width + "px";
  }
  function showLoading() {
    zhEl.className = "zh loading";
    zhEl.textContent = "查询中…";
    ipaEl.textContent = "";
    posEl.hidden = true;
    defEl.hidden = true;
    origEl.hidden = true;
    openEl.hidden = true;
  }
  function hideCard() { cardEl.hidden = true; }
  function speak(text, lang) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang || "en-US";
      u.rate = 0.92;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function ask(msg) {
    return new Promise(res => {
      try { chrome.runtime.sendMessage(msg, r => res(r)); }
      catch (e) { res(null); }
    });
  }
  async function showWord(word, x, y, link) {
    lastWord = word;
    placeCard(x, y, word);
    cardEl.hidden = false;
    wEl.textContent = word;
    showLoading();
    if (link) { openEl.hidden = false; openEl.href = link.href; openEl.target = "_blank"; openEl.rel = "noopener"; }
    const r = await ask({ type: "lookup", word });
    if (lastWord !== word) return;
    if (!r) { zhEl.className = "zh"; zhEl.textContent = "查询失败，请检查网络后重试"; return; }
    ipaEl.textContent = r.ipa ? "[" + r.ipa.replace(/^\/|\/$/g, "") + "]" : "";
    zhEl.className = "zh";
    zhEl.textContent = r.zh || "暂未获取到中文释义";
    if (r.pos) { posEl.hidden = false; posEl.textContent = r.pos; } else posEl.hidden = true;
    if (r.def) { defEl.hidden = false; defEl.textContent = r.def; } else defEl.hidden = true;
  }
  async function showSentence(text, x, y) {
    lastWord = "";
    placeCard(x, y, text);
    cardEl.hidden = false;
    wEl.textContent = "整句翻译";
    showLoading();
    origEl.hidden = false;
    origEl.textContent = text;
    const zh = await ask({ type: "translate", text });
    zhEl.className = "zh";
    zhEl.textContent = zh || "翻译失败，请稍后重试";
  }

  root.querySelector(".head .x").addEventListener("click", hideCard);
  root.querySelector(".head .spk").addEventListener("click", () => {
    if (lastWord) speak(lastWord);
    else if (origEl.textContent) speak(origEl.textContent);
  });

  /* ---------- 点击取词 ---------- */
  document.addEventListener("click", e => {
    if (!enabled) return;
    if (e.composedPath().includes(host)) return;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const t = e.target;
    if (t && t.closest && t.closest("input,textarea,select,[contenteditable='true'],[contenteditable='']")) return;
    if (bubble && bubble.contains && e.composedPath().includes(bubble)) return;
    const hit = wordAt(e.clientX, e.clientY);
    if (!hit) return;
    hideBubble();
    e.preventDefault();
    e.stopPropagation();
    showWord(hit.word, e.clientX, e.clientY, hit.link);
  }, true);

  /* ---------- 选中整句 ---------- */
  function hideBubble() {
    if (bubble) { bubble.remove(); bubble = null; }
  }
  document.addEventListener("mouseup", e => {
    if (!enabled || e.composedPath().includes(host)) return;
    setTimeout(() => {
      const s = window.getSelection();
      const txt = s ? String(s).trim() : "";
      if (!s || s.isCollapsed || txt.length < 6 || !/[A-Za-z]/.test(txt)) { hideBubble(); return; }
      selText = txt.slice(0, 480);
      const r = s.getRangeAt(0).getBoundingClientRect();
      hideBubble();
      const b = document.createElement("div");
      b.className = "bubble";
      b.innerHTML = `<b>译</b><span>翻译整句</span>`;
      b.style.left = Math.min(Math.max(12, r.left + r.width / 2 - 52), window.innerWidth - 130) + "px";
      b.style.top = (r.bottom + 8 > window.innerHeight - 50 ? r.top - 40 : r.bottom + 8) + "px";
      b.addEventListener("mousedown", ev => ev.preventDefault());
      b.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        showSentence(selText, r.left + r.width / 2, r.bottom);
        hideBubble();
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
      });
      root.appendChild(b);
      bubble = b;
    }, 10);
  });

  document.addEventListener("mousedown", e => {
    if (!e.composedPath().includes(host)) { hideCard(); hideBubble(); }
  }, true);

  loadState();
})();
