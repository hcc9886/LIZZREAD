/* LIZZREAD 点词翻译 —— 后台：代理词典/翻译请求，避开页面 CORS 限制 */
const DICT = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const MT = "https://api.mymemory.translated.net/get";
const mem = new Map();

async function jget(url, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function lookup(word) {
  const key = "w:" + word.toLowerCase();
  if (mem.has(key)) return mem.get(key);
  const out = { word, ipa: "", pos: "", def: "", zh: "" };
  const [d, t] = await Promise.all([
    jget(DICT + encodeURIComponent(word)),
    jget(MT + "?q=" + encodeURIComponent(word) + "&langpair=en|zh-CN")
  ]);
  if (Array.isArray(d) && d[0]) {
    out.ipa = d[0].phonetic || (d[0].phonetics || []).map(p => p.text).find(Boolean) || "";
    const m = (d[0].meanings || [])[0];
    if (m) {
      out.pos = m.partOfSpeech || "";
      const df = (m.definitions || [])[0];
      if (df) out.def = df.definition || "";
    }
  }
  if (t && t.responseData && t.responseData.translatedText) {
    const s = String(t.responseData.translatedText);
    if (!/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(s)) out.zh = s;
  }
  mem.set(key, out);
  return out;
}

async function translate(text) {
  const key = "s:" + text;
  if (mem.has(key)) return mem.get(key);
  const t = await jget(MT + "?q=" + encodeURIComponent(text.slice(0, 500)) + "&langpair=en|zh-CN", 10000);
  let zh = "";
  if (t && t.responseData && t.responseData.translatedText) {
    const s = String(t.responseData.translatedText);
    if (!/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(s)) zh = s;
  }
  mem.set(key, zh);
  return zh;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "lookup") {
    lookup(String(msg.word || "")).then(sendResponse);
    return true;
  }
  if (msg && msg.type === "translate") {
    translate(String(msg.text || "")).then(sendResponse);
    return true;
  }
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-translate") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: "toggle" }).catch(() => {});
});
